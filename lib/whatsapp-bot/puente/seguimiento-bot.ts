// Corre el seguimiento de una conversación (lo dispara el puente cada tanto):
// revisa las reglas, le pide a la IA el mensaje con la consigna de seguimiento
// y lo encola. Dependencias inyectadas, como turno-bot.ts.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatosProyecto } from '../ficha';
import { armarFicha, resumenInventario } from '../ficha';
import { aMensajesClaude } from '../ia/historial';
import { armarSystem } from '../ia/prompt';
import { armarMaterial, urlUnidad } from '../material';
import type * as Repo from '../repo';
import { fechaBuenosAires } from '../repo';
import { partirRespuesta } from '../reglas';
import { consignaSeguimiento, debeHacerSeguimiento, esSinSeguimiento } from '../seguimiento';
import type { DepsTurnoBot } from './turno-bot';

export type DepsSeguimiento = Pick<DepsTurnoBot, 'sb' | 'responderTurno' | 'ahora' | 'urlSitio' | 'log'> & {
  repo: Pick<typeof Repo, 'leerBot' | 'leerConversacion' | 'historial' | 'encolar' | 'marcarSeguimiento'>;
  cargarDatosProyecto(sb: SupabaseClient, projectId: string): Promise<DatosProyecto>;
};

export type ResultadoSeguimiento = 'enviado' | 'no_corresponde' | 'sin_interes' | 'sin_respuesta' | 'cliente_volvio' | 'sin_datos';

export async function correrSeguimiento(deps: DepsSeguimiento, botId: string, convId: string): Promise<ResultadoSeguimiento> {
  const { sb, repo } = deps;
  const [bot, conv] = await Promise.all([repo.leerBot(sb, botId), repo.leerConversacion(sb, convId)]);
  if (!bot || !conv) return 'sin_datos';
  const msgs = await repo.historial(sb, conv.id);
  const ahora = deps.ahora();
  const decision = debeHacerSeguimiento({
    bot,
    conv,
    msgs,
    mensajesHoyNumero: bot.mensajes_hoy_fecha === fechaBuenosAires(ahora) ? bot.mensajes_hoy : 0,
    ahora,
  });
  if (!decision.si) return 'no_corresponde';

  const datos = await deps.cargarDatosProyecto(sb, bot.project_id);
  const sitio = datos.proyecto.published && deps.urlSitio ? deps.urlSitio(datos.proyecto.slug) : null;
  const ficha = armarFicha({ ...datos, resumenUnidades: resumenInventario(datos.unidades), sitio }, bot);
  const system = armarSystem(ficha, bot, datos.proyecto.name);
  const mensajes = [...aMensajesClaude(msgs), { role: 'user' as const, content: consignaSeguimiento(decision.diasSilencio) }];

  const imagenes: string[] = [];
  const r = await deps.responderTurno({
    system,
    mensajes,
    deps: {
      unidades: datos.unidades,
      material: armarMaterial(datos),
      linkUnidad: (u) => (sitio && u.id && u.edificioId ? urlUnidad(sitio, u.edificioId, u.id) : null),
      encolarImagenes: async (urls) => {
        imagenes.push(...urls);
      },
      // En un seguimiento no hay pregunta nueva del cliente ni motivo para avisar.
      anotarPregunta: async () => {},
      avisar: async () => 'ya_avisado',
    },
  });

  // Haya o no mensaje, este silencio ya se evaluó: no se vuelve a intentar.
  const marcar = () => repo.marcarSeguimiento(sb, conv.id, ahora);
  if (r.motivoSinRespuesta) {
    await marcar();
    deps.log?.(`[seguimiento ${conv.id}] la IA no respondió (${r.motivoSinRespuesta})`);
    return 'sin_respuesta';
  }
  if (esSinSeguimiento(r.texto)) {
    await marcar();
    return 'sin_interes';
  }

  // El cliente escribió mientras la IA pensaba: lo atiende el turno normal.
  const despues = await repo.historial(sb, conv.id);
  const ultimoAntes = msgs.filter((m) => m.autor === 'cliente').at(-1)?.id ?? null;
  const ultimoAhora = despues.filter((m) => m.autor === 'cliente').at(-1)?.id ?? null;
  if (ultimoAhora !== ultimoAntes) return 'cliente_volvio';

  const destino = conv.contacto_wid ?? conv.contacto_numero;
  const base = ahora.toISOString();
  let parte = 0;
  const encolar = (cuerpo: string | null, adjunto: string | null) =>
    repo.encolar(sb, {
      bot_id: bot.id,
      conversacion_id: conv.id,
      destino,
      cuerpo,
      adjunto_url: adjunto,
      origen: 'bot',
      autor_id: null,
      orden_at: base,
      parte: parte++,
    });
  for (const url of imagenes) await encolar(null, url);
  for (const p of partirRespuesta(r.texto!)) await encolar(p, null);
  await marcar();
  return 'enviado';
}
