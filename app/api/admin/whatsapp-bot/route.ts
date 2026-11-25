import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { ConfigBot, camposDeError, validarConfigContraBot } from '@/lib/whatsapp-bot/esquemas';
import { asignarHostPorDefecto } from '@/lib/whatsapp-bot/host-default';
import type { WaBot } from '@/types/whatsapp-bot';
import { serverError } from '@/lib/api-errors';
import { revalidateProjectById } from '@/lib/revalidate-project';

const PUENTE_VIVO_MS = 3 * 60 * 1000;

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // Configuración del bot y su QR: administrador en adelante.
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await access.supabase
    .from('wa_bots')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) return serverError(error);
  if (!data) return NextResponse.json({ bot: null, puenteVivo: false });

  const bot = data as WaBot;
  const puenteVivo = !!bot.heartbeat_at && Date.now() - new Date(bot.heartbeat_at).getTime() < PUENTE_VIVO_MS;
  // El QR es grande: solo viaja mientras se espera el escaneo.
  if (bot.estado !== 'esperando_qr') bot.qr = null;
  return NextResponse.json({ bot, puenteVivo });
}

export async function PATCH(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const body = await request.json().catch(() => null);
  const parsed = ConfigBot.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Revisá los datos ingresados', campos: camposDeError(parsed.error) },
      { status: 400 }
    );
  }
  const config = parsed.data;

  const { data: existente, error: errLectura } = await supabase
    .from('wa_bots')
    .select('*')
    .eq('project_id', projectId)
    .maybeSingle();
  if (errLectura) return serverError(errLectura);

  const conflicto = validarConfigContraBot(config, existente as WaBot | null);
  if (conflicto) {
    return NextResponse.json({ error: conflicto, campos: { vendedor_whatsapp: conflicto } }, { status: 400 });
  }

  if (existente && Object.keys(config).length === 0) {
    const actual = existente as WaBot;
    await completarHost(actual);
    if (actual.estado !== 'esperando_qr') actual.qr = null;
    return NextResponse.json(actual);
  }

  const query = existente
    ? supabase.from('wa_bots').update(config).eq('id', (existente as WaBot).id)
    // vendedor_user_id: quien crea la configuración (no necesariamente el dueño).
    : supabase.from('wa_bots').insert({ ...config, project_id: projectId, vendedor_user_id: user.id });
  const { data, error } = await query.select('*').single();
  if (error) return serverError(error);
  const bot = data as WaBot;
  await completarHost(bot);
  // El sitio público está cacheado: la burbuja del chat (y el nombre que muestra) aparece al guardar.
  if ('chat_web' in config || 'nombre_bot' in config) await revalidateProjectById(projectId);
  if (bot.estado !== 'esperando_qr') bot.qr = null;
  return NextResponse.json(bot);
}

// Un bot sin máquina nadie lo atiende: le asigna la de este deploy, si hay.
async function completarHost(bot: WaBot) {
  if (bot.host_permitido) return;
  const host = await asignarHostPorDefecto(bot.id);
  if (host) bot.host_permitido = host;
}
