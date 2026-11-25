// Un turno del chat del sitio: el mismo cerebro del bot de WhatsApp (ficha,
// herramientas, modelo) con el system y las herramientas del canal web. La
// historia la arma el servidor desde la base: el navegador solo manda el
// mensaje nuevo. Sin imports de next/react.
// Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaBot, WaConversacion, WaMensaje } from '@/types/whatsapp-bot';
import { cargarDatosProyecto } from '../datos';
import { armarFicha, resumenInventario, unidadesParaAviso, type DatosProyecto } from '../ficha';
import { HERRAMIENTAS_WEB, type DepsHerramientas } from '../ia/herramientas';
import { aMensajesClaude } from '../ia/historial';
import { armarSystem } from '../ia/prompt';
import type { ResultadoTurno } from '../ia/turno';
import { armarMaterial, urlUnidad } from '../material';
import { registrarPregunta } from '../preguntas';
import { partirRespuesta } from '../reglas';
import { agendarVisita, cancelarVisitasDeConversacion, registrarUsoIa, visitasActivas } from '../repo';
import { normalizarConfigVisitas } from '../visitas';
import {
  contarMensajesCliente,
  conversacionWeb,
  crearConversacionWeb,
  guardarMensajeWeb,
  leadDeCharlaWeb,
  mensajesWeb,
  registrarAvisoWeb,
  turnosWebHoy,
  type MensajeWeb,
} from './repo-web';

export const LIMITES_CHAT_WEB = { mensajesPorCharla: 40, turnosPorDia: 300 } as const;

export type ErrorChatWeb = 'limite_charla' | 'limite_dia' | 'sin_respuesta';
/** `token` null: no se llegó a crear la charla (tope diario en el primer mensaje). */
export type RespuestaChatWeb = {
  token: string | null;
  partes: string[];
  imagenes: string[];
  /** PDFs (el brief): el chat los muestra como link, no como imagen. */
  documentos: string[];
  error?: ErrorChatWeb;
};

const esDocumento = (url: string) => /\.pdf(?:[?#]|$)|\/api\/ficha\//i.test(url);

/** Ruta del sitio ("/demo/f.jpg") → URL absoluta contra el origen público; las absolutas quedan igual. */
function urlAbsoluta(url: string, sitio: string): string {
  try {
    return new URL(url, new URL(sitio).origin).toString();
  } catch {
    return url;
  }
}

/** Lo que mostró el bot (imágenes, PDFs) llega a la IA como marca, sin la URL (no tiene que pegar links). */
function paraIa(ms: WaMensaje[]): WaMensaje[] {
  return ms.map((m) => (m.autor === 'bot' && (m.tipo === 'imagen' || m.tipo === 'documento') ? { ...m, cuerpo: null } : m));
}

/** Traduce la ruta actual del navegador a contexto verificado del proyecto (nunca texto crudo del cliente). */
export function contextoPaginaWeb(ruta: string | null | undefined, datos: DatosProyecto): string | null {
  if (!ruta) return null;
  const [sinHash] = ruta.split('#');
  const qIndex = sinHash.indexOf('?');
  const pathPart = qIndex >= 0 ? sinHash.slice(0, qIndex) : sinHash;
  const queryPart = qIndex >= 0 ? sinHash.slice(qIndex + 1) : '';
  const limpia = pathPart.replace(/\/+$/, '') || '/';
  const compareParam = queryPart ? new URLSearchParams(queryPart).get('compare')?.trim() : null;

  const unidadMatch = /^\/edificio\/([^/]+)\/unidad\/([^/]+)$/.exec(limpia);
  if (unidadMatch) {
    let bId: string;
    let uId: string;
    try {
      bId = decodeURIComponent(unidadMatch[1]);
      uId = decodeURIComponent(unidadMatch[2]);
    } catch {
      return null;
    }
    const u =
      datos.unidades.find((x) => x.id === uId && x.edificioId === bId) ??
      datos.unidades.find((x) => x.id === uId);
    if (!u) return null;
    const detalle = [u.tipo, u.edificio].filter(Boolean).join(' · ');
    if (compareParam) {
      const u2 = datos.unidades.find((x) => x.id === compareParam || x.codigo === compareParam);
      if (u2 && u2.id !== u.id) {
        const d2 = [u2.tipo, u2.edificio].filter(Boolean).join(' · ');
        return `[Contexto de navegación: el cliente está en el comparador viendo lado a lado la unidad ${u.codigo}${detalle ? ` (${detalle})` : ''} y la unidad ${u2.codigo}${d2 ? ` (${d2})` : ''}. Si pide diferencias, comparación o recomendación entre ambas, consultá ver_unidad de las dos y comparalas de forma clara (precio, m², ambientes, piso, orientación, cocheras, expensas y características).]`;
      }
    }
    return `[Contexto de navegación: el cliente está viendo la ficha de la unidad ${u.codigo}${detalle ? ` (${detalle})` : ''}. Si pregunta "cuánto sale", "tiene cochera", "mandame el plano", etc. sin aclarar cuál, se refiere a esta unidad (usá ver_unidad para los datos en vivo).]`;
  }

  const edifRecorridoMatch = /^\/edificio\/([^/]+)\/recorrido$/.exec(limpia);
  if (edifRecorridoMatch) {
    try {
      const bId = decodeURIComponent(edifRecorridoMatch[1]);
      const b = datos.edificios.find((x) => x.id === bId);
      if (b) return `[Contexto de navegación: el cliente está viendo el recorrido 360° de ${b.name}.]`;
    } catch { /* ruta inválida */ }
    return null;
  }

  const edifMatch = /^\/edificio\/([^/]+)$/.exec(limpia);
  if (edifMatch) {
    try {
      const bId = decodeURIComponent(edifMatch[1]);
      const b = datos.edificios.find((x) => x.id === bId);
      if (b) return `[Contexto de navegación: el cliente está viendo ${b.name}.]`;
    } catch { /* ruta inválida */ }
    return null;
  }

  const secciones: Record<string, string> = {
    '/': 'la portada principal del proyecto',
    '/unidades': 'el listado de unidades',
    '/amenities': 'la sección de amenities',
    '/ubicacion': 'la sección de ubicación y entorno',
    '/masterplan': 'el masterplan del proyecto',
    '/recorrido': 'el recorrido 360° del proyecto',
  };
  const sec = secciones[limpia];
  return sec ? `[Contexto de navegación: el cliente está viendo ${sec}.]` : null;
}

export async function turnoChatWeb(i: {
  sb: SupabaseClient;
  bot: WaBot;
  projectId: string;
  token: string | null;
  mensaje: string;
  visitorId: string | null;
  ref: string | null;
  /** Ruta relativa dentro del proyecto que está viendo el usuario en el navegador. */
  ruta?: string | null;
  /** URL pública del proyecto (projectCanonical). */
  sitio: string;
  urlAdmin: string;
  ahora: Date;
  responder: (x: {
    system: Anthropic.Beta.BetaTextBlockParam[];
    mensajes: Anthropic.Beta.BetaMessageParam[];
    deps: DepsHerramientas;
    herramientas: Anthropic.Beta.BetaToolUnion[];
  }) => Promise<ResultadoTurno>;
  cargarDatos?: (sb: SupabaseClient, projectId: string) => Promise<DatosProyecto>;
  /** Tareas que no tienen que demorar la respuesta (emails); default, se esperan. */
  enSegundoPlano?: (tarea: Promise<void>) => void;
}): Promise<RespuestaChatWeb | null> {
  const { sb, bot, ahora } = i;

  const existente = i.token ? await conversacionWeb(sb, i.projectId, i.token) : null;
  if (i.token && !existente) return null;
  const sinRespuesta = (token: string | null, error: ErrorChatWeb): RespuestaChatWeb => ({
    token,
    partes: [],
    imagenes: [],
    documentos: [],
    error,
  });

  // Los topes van antes de guardar: un mensaje que no se va a responder no queda en la charla.
  if (existente && (await contarMensajesCliente(sb, existente.id)) >= LIMITES_CHAT_WEB.mensajesPorCharla) {
    return sinRespuesta(i.token, 'limite_charla');
  }
  if ((await turnosWebHoy(sb, i.projectId, ahora)) >= LIMITES_CHAT_WEB.turnosPorDia) return sinRespuesta(i.token, 'limite_dia');

  const nueva = existente ? null : await crearConversacionWeb(sb, bot);
  const charla = existente ?? nueva!.conv;
  const token = i.token ?? nueva!.token;
  // Con la charla creada, cualquier falla devuelve su token: el navegador la
  // sigue (y "Reintentar" no abre otra) y el mensaje del cliente no se pierde.
  try {
    return await responderEnCharla(i, charla, token);
  } catch (e) {
    console.error('[chat web] falló el turno:', e);
    return sinRespuesta(token, 'sin_respuesta');
  }
}

/** Mismo texto del cliente hace menos de esto, sin respuesta después: es un "Reintentar". */
const MS_REINTENTO = 2 * 60_000;

async function responderEnCharla(
  i: Parameters<typeof turnoChatWeb>[0],
  charla: WaConversacion,
  token: string,
): Promise<RespuestaChatWeb> {
  const { sb, bot, ahora } = i;
  const previos = i.token ? await mensajesWeb(sb, charla.id) : [];
  const ultimo = previos.at(-1);
  const reintento =
    ultimo?.autor === 'cliente' &&
    ultimo.cuerpo === i.mensaje &&
    ahora.getTime() - new Date(ultimo.enviado_at).getTime() < MS_REINTENTO;
  const historia = [...previos];
  if (!reintento) {
    await guardarMensajeWeb(sb, charla.id, { autor: 'cliente', tipo: 'texto', cuerpo: i.mensaje }, ahora);
    historia.push(mensajeCliente(charla.id, i.mensaje, ahora));
  }

  const datos = await (i.cargarDatos ?? cargarDatosProyecto)(sb, i.projectId);
  const configVisitas = normalizarConfigVisitas(bot.visitas);
  const ficha = armarFicha(
    { ...datos, resumenUnidades: resumenInventario(datos.unidades), sitio: i.sitio, visitas: configVisitas },
    bot,
  );
  const system = armarSystem(ficha, bot, datos.proyecto.name, 'web');
  const activas = configVisitas?.activo ? await visitasActivas(sb, i.projectId, ahora) : [];
  const mensajes = aMensajesClaude(paraIa(historia));
  const ctx = contextoPaginaWeb(i.ruta, datos);
  if (ctx && mensajes.length > 0) {
    const ultima = mensajes[mensajes.length - 1];
    if (ultima.role === 'user') {
      ultima.content = typeof ultima.content === 'string'
        ? `${ctx}\n${ultima.content}`
        : [{ type: 'text', text: ctx }, ...ultima.content];
    }
  }

  const imagenes: string[] = [];
  const documentos: string[] = [];
  const r = await i.responder({
    system,
    mensajes,
    herramientas: HERRAMIENTAS_WEB,
    deps: {
      canal: 'web',
      unidades: datos.unidades,
      material: armarMaterial(datos),
      planes: datos.calculadora?.financing_plans ?? [],
      ...(configVisitas?.activo
        ? {
            visitas: {
              config: configVisitas,
              ocupados: activas.map((v) => ({ inicio: new Date(v.inicio), fin: new Date(v.fin) })),
              delCliente: activas
                .filter((v) => v.conversacion_id === charla.id && new Date(v.inicio) > ahora)
                .map((v) => new Date(v.inicio)),
              ahora,
              agendar: async (inicio, fin, nombre, modalidad) => {
                // Sin lead no hay a quién confirmarle la visita: la IA pide el contacto.
                const lead = await leadDeCharlaWeb(sb, charla.id);
                if (!lead) return 'sin_contacto';
                return agendarVisita(sb, {
                  bot,
                  conv: charla,
                  inicio,
                  fin,
                  nombre: nombre ?? lead.name,
                  proyecto: datos.proyecto,
                  urlAdmin: i.urlAdmin,
                  telefono: lead.phone,
                  email: lead.email,
                  modalidad,
                  lugar: configVisitas.lugar,
                });
              },
              cancelar: async () =>
                (
                  await cancelarVisitasDeConversacion(sb, {
                    bot,
                    conv: charla,
                    ahora,
                    proyecto: datos.proyecto,
                    urlAdmin: i.urlAdmin,
                  })
                ).map((v) => new Date(v.inicio)),
            },
          }
        : {}),
      anotarPregunta: async (p) => {
        await registrarPregunta(sb, { projectId: i.projectId, conversacionId: charla.id, ...p });
      },
      linkUnidad: (u) => (u.id && u.edificioId ? urlUnidad(i.sitio, u.edificioId, u.id) : null),
      fichaUnidadPdf: (u) => {
        if (!u.id || !datos.proyecto.slug) return null;
        try {
          const origin = new URL(i.sitio).origin;
          return `${origin}/api/ficha/${datos.proyecto.slug}/${u.id}${i.ref ? `?ref=${encodeURIComponent(i.ref)}` : ''}`;
        } catch {
          return null;
        }
      },
      encolarImagenes: async (urls) => {
        for (const u of urls.map((x) => urlAbsoluta(x, i.sitio))) (esDocumento(u) ? documentos : imagenes).push(u);
      },
      avisar: (d) =>
        registrarAvisoWeb(
          sb,
          charla,
          {
            telefono: d.telefono ?? null,
            email: d.email ?? null,
            nombre: d.nombre ?? null,
            unidades: d.unidades,
            unidadesTexto: unidadesParaAviso(d.unidades, datos.unidades),
            resumen: d.resumen,
            conversacionId: charla.id,
            ...(d.calificacion ? { calificacion: d.calificacion } : {}),
            visitorId: i.visitorId,
            ref: i.ref,
          },
          bot,
          datos.proyecto,
          i.urlAdmin,
          i.enSegundoPlano,
        ),
    },
  });

  if (r.uso) {
    await registrarUsoIa(sb, {
      projectId: i.projectId,
      botId: bot.id,
      conversacionId: charla.id,
      origen: 'web',
      uso: r.uso,
      motivoSinRespuesta: r.motivoSinRespuesta ?? null,
    }, (m) => console.error('[chat web]', m));
  }

  const partes = !r.motivoSinRespuesta && r.texto ? partirRespuesta(r.texto) : [];
  if (r.motivoSinRespuesta || (partes.length === 0 && imagenes.length === 0 && documentos.length === 0)) {
    return { token, partes: [], imagenes: [], documentos: [], error: 'sin_respuesta' };
  }

  // Después del mensaje del cliente y en el orden en que se muestran: imágenes y texto.
  const desde = Math.max(Date.now(), ahora.getTime() + 1);
  const salientes: MensajeWeb[] = [
    ...imagenes.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'imagen' as const, cuerpo })),
    ...documentos.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'documento' as const, cuerpo })),
    ...partes.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'texto' as const, cuerpo })),
  ];
  for (const [n, m] of salientes.entries()) await guardarMensajeWeb(sb, charla.id, m, new Date(desde + n));
  return { token, partes, imagenes, documentos };
}

/** El mensaje recién guardado, con forma de fila, para la historia de este turno. */
function mensajeCliente(convId: string, cuerpo: string, at: Date): WaMensaje {
  const iso = at.toISOString();
  return {
    id: 'nuevo', conversacion_id: convId, wa_id: null, direccion: 'entrante', autor: 'cliente', tipo: 'texto',
    cuerpo, media_path: null, enviado_at: iso, ack: null, created_at: iso, orden_at: null, salida_id: null,
  };
}

/** La charla guardada, para retomarla en el navegador; null si el token no es de este proyecto. */
export async function charlaWeb(
  sb: SupabaseClient,
  projectId: string,
  token: string,
): Promise<{ mensajes: MensajeWeb[] } | null> {
  const conv = await conversacionWeb(sb, projectId, token);
  if (!conv) return null;
  const ms = await mensajesWeb(sb, conv.id);
  return {
    mensajes: ms
      .filter((m) => (m.autor === 'cliente' || m.autor === 'bot') && (m.tipo === 'texto' || m.tipo === 'imagen' || m.tipo === 'documento') && m.cuerpo)
      .map((m) => ({ autor: m.autor as 'cliente' | 'bot', tipo: m.tipo as MensajeWeb['tipo'], cuerpo: m.cuerpo as string })),
  };
}
