// Un turno de la IA para una conversación (lo dispara el Agrupador): decide
// si corresponde responder, arma el contexto, corre la IA y encola lo que
// contesta. Las dependencias llegan inyectadas (en el puente: repo, Supabase
// y Claude reales; en los tests: falsos).
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaMensaje, WaSalida } from '@/types/whatsapp-bot';
import type { DatosProyecto } from '../ficha';
import { armarFicha, resumenInventario, unidadesParaAviso } from '../ficha';
import type { DepsHerramientas } from '../ia/herramientas';
import { aMensajesClaude } from '../ia/historial';
import { armarSystem } from '../ia/prompt';
import type { ResultadoTurno } from '../ia/turno';
import type * as Repo from '../repo';
import { fechaBuenosAires } from '../repo';
import { debeResponder, esContestadorAutomatico, estaEnModoHumano, partirRespuesta } from '../reglas';

export type DepsTurnoBot = {
  sb: SupabaseClient;
  repo: Pick<
    typeof Repo,
    'leerBot' | 'leerConversacion' | 'historial' | 'contarRespuestasBotUltimaHora' | 'encolar' | 'pausarIa' | 'registrarAviso'
  >;
  cargarDatosProyecto(sb: SupabaseClient, projectId: string): Promise<DatosProyecto>;
  /** responderTurno de ia/turno.ts con el cliente de Anthropic ya puesto. */
  responderTurno(i: {
    system: Anthropic.Beta.BetaTextBlockParam[];
    mensajes: Anthropic.Beta.BetaMessageParam[];
    deps: DepsHerramientas;
  }): Promise<ResultadoTurno>;
  ahora(): Date;
  /** Base del link "Ver chat" del aviso al vendedor. */
  urlAdmin: string;
  log?: (m: string) => void;
};

export type ResultadoTurnoBot =
  | 'respondido'
  /** No hay nada nuevo del cliente (el historial termina en una respuesta nuestra). */
  | 'sin_novedad'
  /** debeResponder dijo que no (o el vendedor tomó la charla mientras la IA pensaba). */
  | 'no_responde'
  /** La IA no respondió (refusal, error, max_iteraciones): queda marcado. */
  | 'pausado'
  | 'sin_texto'
  | 'sin_datos';

/** Una respuesta del bot que sigue en la cola (todavía no salió): historial() la arma con id = salida_id. */
const enCola = (m: WaMensaje) => m.salida_id !== null && m.id === m.salida_id;

const ms = (iso: string) => new Date(iso).getTime();

/**
 * ¿Lo nuevo del cliente es un contestador automático? Mira solo los mensajes
 * del cliente que llegaron desde el último turno: posteriores a nuestro último
 * mensaje (enviado o en la cola) y a `vistoHasta` (lo que ya evaluó un turno
 * anterior). Así un mensaje que ya calló un turno no calla los siguientes.
 * La regla de tiempo se mide contra nuestro último mensaje *enviado*.
 */
export function hayContestador(msgs: WaMensaje[], vistoHasta: string | null): boolean {
  const visto = vistoHasta ? ms(vistoHasta) : null;
  let ultimoEnviado: number | null = null;
  let nuevos: WaMensaje[] = [];
  for (const m of msgs) {
    if (m.autor === 'cliente') {
      if (visto === null || ms(m.enviado_at) > visto) nuevos.push(m);
    } else if (m.direccion === 'saliente') {
      if (!enCola(m)) ultimoEnviado = ms(m.enviado_at);
      nuevos = [];
    }
  }
  return nuevos.some((m) => {
    const seg = ultimoEnviado === null ? null : (ms(m.enviado_at) - ultimoEnviado) / 1000;
    return esContestadorAutomatico(m.cuerpo ?? '', seg);
  });
}

export async function correrTurnoIA(deps: DepsTurnoBot, botId: string, convId: string): Promise<ResultadoTurnoBot> {
  const { sb, repo } = deps;
  const [bot, conv] = await Promise.all([repo.leerBot(sb, botId), repo.leerConversacion(sb, convId)]);
  if (!bot || !conv) return 'sin_datos';

  const msgs = await repo.historial(sb, conv.id);
  const mensajes = aMensajesClaude(msgs);
  // Nada nuevo del cliente: ya se respondió (o está en la cola) todo lo que vio este turno.
  if (mensajes.length === 0 || mensajes[mensajes.length - 1].role !== 'user') return 'sin_novedad';

  // Hasta dónde vio este turno: el mensaje del cliente más nuevo del historial.
  const vistoHasta = msgs
    .filter((m) => m.autor === 'cliente')
    .reduce<string | null>((max, m) => (max === null || ms(m.enviado_at) > ms(max) ? m.enviado_at : max), null);
  /**
   * Guarda por qué no respondió (null = respondió). Un turno que se calla
   * además corre la marca `ia_visto_hasta`: lo que ya evaluó no vuelve a
   * contar para la detección de contestadores.
   */
  const marcar = async (motivo: string | null, callado = true) => {
    const avanzar =
      callado && vistoHasta !== null && (conv.ia_visto_hasta === null || ms(vistoHasta) > ms(conv.ia_visto_hasta));
    if (avanzar) await repo.pausarIa(sb, conv.id, motivo, vistoHasta as string);
    else if (conv.ia_pausada_motivo !== motivo) await repo.pausarIa(sb, conv.id, motivo);
  };

  const ahora = deps.ahora();
  const decision = debeResponder({
    bot,
    conv,
    esContestador: hayContestador(msgs, conv.ia_visto_hasta),
    respuestasUltimaHora: await repo.contarRespuestasBotUltimaHora(sb, conv.id),
    mensajesHoyNumero: bot.mensajes_hoy_fecha === fechaBuenosAires(ahora) ? bot.mensajes_hoy : 0,
    ahora,
  });
  if (!decision.responde) {
    await marcar(decision.motivo);
    return 'no_responde';
  }

  const datos = await deps.cargarDatosProyecto(sb, bot.project_id);
  const ficha = armarFicha({ ...datos, resumenUnidades: resumenInventario(datos.unidades) }, bot);
  const system = armarSystem(ficha, bot, datos.proyecto.name);

  // Todas las respuestas de este turno (imágenes de las herramientas y partes
  // del texto) van justo después del último mensaje del cliente que vio, en el
  // orden en que se encolan: primero las imágenes, después el texto.
  const ultimoCliente = [...msgs].reverse().find((m) => m.autor === 'cliente');
  const base = new Date(new Date(ultimoCliente?.enviado_at ?? ahora).getTime() + 1).toISOString();
  let parte = 0;
  const destino = conv.contacto_wid ?? conv.contacto_numero;
  const encolar = (cuerpo: string | null, adjunto: string | null): Promise<WaSalida> =>
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

  // Las imágenes que pide la IA se juntan en memoria y se encolan recién si el
  // turno termina bien: si falla o el vendedor toma la charla, no sale nada.
  const imagenes: string[] = [];
  const r = await deps.responderTurno({
    system,
    mensajes,
    deps: {
      unidades: datos.unidades,
      encolarImagenes: async (urls) => {
        imagenes.push(...urls);
      },
      avisar: (d) =>
        repo.registrarAviso(
          sb,
          conv,
          {
            telefono: conv.contacto_numero,
            conversacionId: conv.id,
            ...d,
            // Spec §7.7: el aviso lista las unidades con ambientes, m² y precio.
            unidadesTexto: unidadesParaAviso(d.unidades, datos.unidades),
          },
          bot,
          datos.proyecto,
          deps.urlAdmin,
        ),
    },
  });

  if (r.motivoSinRespuesta) {
    // No se le manda nada al cliente; el panel muestra por qué.
    await marcar(r.motivoSinRespuesta);
    return 'pausado';
  }
  const partes = r.texto ? partirRespuesta(r.texto) : [];
  if (imagenes.length === 0 && partes.length === 0) {
    await marcar(conv.ia_pausada_motivo);
    return 'sin_texto';
  }

  // El vendedor pudo tomar la conversación mientras la IA pensaba.
  const actual = await repo.leerConversacion(sb, conv.id);
  if (!actual || estaEnModoHumano(actual, deps.ahora())) {
    if (actual) await marcar(conv.ia_pausada_motivo);
    return 'no_responde';
  }

  for (const url of imagenes) await encolar(null, url);
  for (const p of partes) await encolar(p, null);
  // Respondió: se limpia el motivo de un turno anterior (la respuesta en sí
  // ya separa lo nuevo del cliente para la detección de contestadores).
  await marcar(null, false);
  return 'respondido';
}
