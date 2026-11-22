import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { cargarDatosProyecto } from '@/lib/whatsapp-bot/datos';
import { PedidoSimulacion } from '@/lib/whatsapp-bot/esquemas';
import { crearClienteClaude } from '@/lib/whatsapp-bot/ia/cliente';
import { responderTurno } from '@/lib/whatsapp-bot/ia/turno';
import { simularTurno } from '@/lib/whatsapp-bot/simulador';
import { registrarUsoIa, visitasActivas } from '@/lib/whatsapp-bot/repo';
import { normalizarConfigVisitas } from '@/lib/whatsapp-bot/visitas';
import { serverError } from '@/lib/api-errors';

// Un turno puede encadenar varias llamadas a Claude (herramientas).
export const maxDuration = 60;

/**
 * Simulador del bot: corre un turno de la IA con la configuración guardada y
 * los datos reales del proyecto, sin WhatsApp. No encola, no avisa ni guarda nada.
 */
export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Falta ANTHROPIC_API_KEY en el servidor del panel: sin eso no se puede probar el bot.' },
      { status: 503 },
    );
  }

  const parsed = PedidoSimulacion.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  // Cada mensaje es una llamada paga a Claude.
  const limitado = await rateLimitOrRespond(
    { key: `wa-simular:user:${user.id}`, windowSeconds: 600, max: 40 },
    'Muchas pruebas seguidas: esperá unos minutos y seguí.',
  );
  if (limitado) return limitado;

  const { data: bot, error: errBot } = await supabase
    .from('wa_bots')
    .select('id, nombre_bot, criterio_aviso, conocimiento, visitas')
    .eq('project_id', projectId)
    .maybeSingle();
  if (errBot) return serverError(errBot);

  // Todo el turno tiene que entrar en el maxDuration (60 s) de la función: si
  // no, Vercel la corta con un 504 sin respuesta. Margen para cargar los datos.
  const limiteTurno = AbortSignal.timeout(50_000);
  try {
    // Service role: el acceso al proyecto ya se probó arriba.
    const admin = createAdminClient();
    const datos = await cargarDatosProyecto(admin, projectId);
    const ahora = new Date();
    const config = normalizarConfigVisitas(bot?.visitas);
    const ocupados = config?.activo
      ? (await visitasActivas(admin, projectId, ahora)).map((v) => ({ inicio: new Date(v.inicio), fin: new Date(v.fin) }))
      : [];
    const sitio = datos.proyecto.published
      ? getProjectDisplayUrl(datos.proyecto.slug, new URL(request.url).origin)
      : null;
    // Una llamada lenta no se reintenta acá: el reintento propio del turno alcanza.
    const cliente = crearClienteClaude(process.env, { timeout: 25_000, maxRetries: 0 });
    const r = await simularTurno({
      datos,
      bot: bot ?? { nombre_bot: null, criterio_aviso: null, conocimiento: null },
      sitio,
      mensajes: parsed.data.mensajes,
      yaAvisado: parsed.data.yaAvisado,
      visitas: { config, ocupados, ahora },
      responder: async (x) => {
        const res = await responderTurno({ cliente, ...x, signal: limiteTurno });
        if (res.uso) {
          // Aparte del bot real (origen 'simulador'), para no mezclar pruebas con el costo de las charlas.
          await registrarUsoIa(admin, {
            projectId,
            botId: bot?.id ?? null,
            conversacionId: null,
            origen: 'simulador',
            uso: res.uso,
            motivoSinRespuesta: res.motivoSinRespuesta ?? null,
          }, (m) => console.error(m));
        }
        return res;
      },
    });
    return NextResponse.json(r);
  } catch (e) {
    console.error('[whatsapp-bot] falló la simulación:', e);
    return NextResponse.json({ error: 'No se pudo correr la prueba. Probá de nuevo.' }, { status: 500 });
  }
}
