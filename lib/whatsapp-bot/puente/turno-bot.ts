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
import { armarMaterial, urlUnidad } from '../material';
import { registrarPregunta } from '../preguntas';
import { prepararMediosIa, type DepsMediosIa } from '../medios-ia';
import { normalizarConfigVisitas } from '../visitas';
import type { ResultadoTurno } from '../ia/turno';
import type { RegistroUsoIa } from '../ia/uso';
import type * as Repo from '../repo';
import { fechaBuenosAires } from '../repo';
import { debeResponder, destinoWhatsapp, esContestadorAutomatico, estaEnModoHumano, partirRespuesta } from '../reglas';

export type DepsTurnoBot = {
  sb: SupabaseClient;
  repo: Pick<
    typeof Repo,
    | 'leerBot'
    | 'leerConversacion'
    | 'historial'
    | 'contarRespuestasBotUltimaHora'
    | 'encolar'
    | 'pausarIa'
    | 'registrarAviso'
    | 'guardarTranscripcion'
    | 'visitasActivas'
    | 'agendarVisita'
    | 'cancelarVisitasDeConversacion'
  >;
  cargarDatosProyecto(sb: SupabaseClient, projectId: string): Promise<DatosProyecto>;
  /** responderTurno de ia/turno.ts con el cliente de Anthropic ya puesto. */
  responderTurno(i: {
    system: Anthropic.Beta.BetaTextBlockParam[];
    mensajes: Anthropic.Beta.BetaMessageParam[];
    deps: DepsHerramientas;
  }): Promise<ResultadoTurno>;
  /** Guarda el uso de tokens del turno (repo.registrarUsoIa); sin esto no se mide. */
  registrarUso?: (r: RegistroUsoIa) => Promise<void>;
  ahora(): Date;
  /** Base del link "Ver chat" del aviso al vendedor. */
  urlAdmin: string;
  /** URL pública del sitio de un proyecto (por slug). Sin esto, el bot no pasa links. */
  urlSitio?: (slug: string) => string;
  /**
   * Imágenes y audios del cliente para la IA (bajar de Storage, transcribir).
   * Sin esto, la IA solo ve las marcas de texto ("[El cliente mandó una imagen]").
   */
  medios?: Pick<DepsMediosIa, 'bajar' | 'transcribir'>;
  /** registrarPregunta de preguntas.ts (inyectable para los tests). */
  registrarPregunta?: typeof registrarPregunta;
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
  // Links solo de un sitio publicado: un borrador no lo puede ver el cliente.
  const sitio = datos.proyecto.published && deps.urlSitio ? deps.urlSitio(datos.proyecto.slug) : null;
  const configVisitas = normalizarConfigVisitas(bot.visitas);
  const ficha = armarFicha(
    { ...datos, resumenUnidades: resumenInventario(datos.unidades), sitio, visitas: configVisitas },
    bot,
  );
  // Agenda viva (solo si el bot agenda visitas): qué turnos están tomados y si este cliente ya tiene uno.
  const activas = configVisitas?.activo ? await repo.visitasActivas(sb, bot.project_id, ahora) : [];
  const system = armarSystem(ficha, bot, datos.proyecto.name);

  // Todas las respuestas de este turno (imágenes de las herramientas y partes
  // del texto) van justo después del último mensaje del cliente que vio, en el
  // orden en que se encolan: primero las imágenes, después el texto.
  const ultimoCliente = [...msgs].reverse().find((m) => m.autor === 'cliente');
  const base = new Date(new Date(ultimoCliente?.enviado_at ?? ahora).getTime() + 1).toISOString();
  let parte = 0;
  const destino = destinoWhatsapp(conv);
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

  // Recién acá (ya se decidió responder) se bajan imágenes y se transcriben audios.
  let mensajesIa = mensajes;
  if (deps.medios) {
    const m = await prepararMediosIa(msgs, {
      ...deps.medios,
      guardarTranscripcion: (id, texto) => repo.guardarTranscripcion(sb, id, texto),
      log: deps.log,
    });
    mensajesIa = aMensajesClaude(m.mensajes, m.imagenes);
  }

  const r = await deps.responderTurno({
    system,
    mensajes: mensajesIa,
    deps: {
      unidades: datos.unidades,
      material: armarMaterial(datos),
      ...(configVisitas?.activo
        ? {
            visitas: {
              config: configVisitas,
              ocupados: activas.map((v) => ({ inicio: new Date(v.inicio), fin: new Date(v.fin) })),
              delCliente: activas
                .filter((v) => v.conversacion_id === conv.id && new Date(v.inicio) > ahora)
                .map((v) => new Date(v.inicio)),
              ahora,
              agendar: (inicio, fin, nombre) =>
                repo.agendarVisita(sb, { bot, conv, inicio, fin, nombre, proyecto: datos.proyecto, urlAdmin: deps.urlAdmin }),
              cancelar: async () =>
                (
                  await repo.cancelarVisitasDeConversacion(sb, {
                    bot,
                    conv,
                    ahora,
                    proyecto: datos.proyecto,
                    urlAdmin: deps.urlAdmin,
                  })
                ).map((v) => new Date(v.inicio)),
            },
          }
        : {}),
      anotarPregunta: async (p) => {
        const r = await (deps.registrarPregunta ?? registrarPregunta)(sb, {
          projectId: bot.project_id,
          conversacionId: conv.id,
          ...p,
        });
        if (r === 'omitida') deps.log?.(`[bot ${bot.id}] pregunta sin anotar (tope, vacía o falta la tabla): ${p.tema}`);
      },
      linkUnidad: (u) => (sitio && u.id && u.edificioId ? urlUnidad(sitio, u.edificioId, u.id) : null),
      encolarImagenes: async (urls) => {
        imagenes.push(...urls);
      },
      avisar: (d) =>
        repo.registrarAviso(
          sb,
          conv,
          {
            telefono: conv.contacto_numero ?? destino, // en el puente siempre hay número (destinoWhatsapp)
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

  if (r.uso && deps.registrarUso) {
    await deps.registrarUso({
      projectId: bot.project_id,
      botId: bot.id,
      conversacionId: conv.id,
      origen: 'respuesta',
      uso: r.uso,
      motivoSinRespuesta: r.motivoSinRespuesta ?? null,
    });
  }

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
