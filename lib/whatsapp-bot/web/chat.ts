// Un turno del chat del sitio: el mismo cerebro del bot de WhatsApp (ficha,
// herramientas, modelo) con el system y las herramientas del canal web. La
// historia la arma el servidor desde la base: el navegador solo manda el
// mensaje nuevo. Sin imports de next/react.
// Spec: docs/superpowers/specs/2026-11-24-chat-web-design.md
import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaBot, WaMensaje } from '@/types/whatsapp-bot';
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

const esDocumento = (url: string) => /\.pdf(?:[?#]|$)/i.test(url);

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

export async function turnoChatWeb(i: {
  sb: SupabaseClient;
  bot: WaBot;
  projectId: string;
  token: string | null;
  mensaje: string;
  visitorId: string | null;
  ref: string | null;
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

  let conv = i.token ? await conversacionWeb(sb, i.projectId, i.token) : null;
  if (i.token && !conv) return null;
  const sinRespuesta = (error: ErrorChatWeb): RespuestaChatWeb => ({
    token: conv?.web_token ?? null,
    partes: [],
    imagenes: [],
    documentos: [],
    error,
  });

  // Los topes van antes de guardar: un mensaje que no se va a responder no queda en la charla.
  if (conv && (await contarMensajesCliente(sb, conv.id)) >= LIMITES_CHAT_WEB.mensajesPorCharla) {
    return sinRespuesta('limite_charla');
  }
  if ((await turnosWebHoy(sb, i.projectId, ahora)) >= LIMITES_CHAT_WEB.turnosPorDia) return sinRespuesta('limite_dia');

  if (!conv) conv = await crearConversacionWeb(sb, bot);
  const charla = conv;
  await guardarMensajeWeb(sb, charla.id, { autor: 'cliente', tipo: 'texto', cuerpo: i.mensaje }, ahora);

  const datos = await (i.cargarDatos ?? cargarDatosProyecto)(sb, i.projectId);
  const configVisitas = normalizarConfigVisitas(bot.visitas);
  const ficha = armarFicha(
    { ...datos, resumenUnidades: resumenInventario(datos.unidades), sitio: i.sitio, visitas: configVisitas },
    bot,
  );
  const system = armarSystem(ficha, bot, datos.proyecto.name, 'web');
  const activas = configVisitas?.activo ? await visitasActivas(sb, i.projectId, ahora) : [];
  const mensajes = aMensajesClaude(paraIa(await mensajesWeb(sb, charla.id)));

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
      ...(configVisitas?.activo
        ? {
            visitas: {
              config: configVisitas,
              ocupados: activas.map((v) => ({ inicio: new Date(v.inicio), fin: new Date(v.fin) })),
              delCliente: activas
                .filter((v) => v.conversacion_id === charla.id && new Date(v.inicio) > ahora)
                .map((v) => new Date(v.inicio)),
              ahora,
              agendar: async (inicio, fin, nombre) => {
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
    });
  }

  const partes = !r.motivoSinRespuesta && r.texto ? partirRespuesta(r.texto) : [];
  if (r.motivoSinRespuesta || (partes.length === 0 && imagenes.length === 0 && documentos.length === 0)) {
    return { token: charla.web_token ?? null, partes: [], imagenes: [], documentos: [], error: 'sin_respuesta' };
  }

  // Después del mensaje del cliente y en el orden en que se muestran: imágenes y texto.
  const desde = Math.max(Date.now(), ahora.getTime() + 1);
  const salientes: MensajeWeb[] = [
    ...imagenes.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'imagen' as const, cuerpo })),
    ...documentos.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'documento' as const, cuerpo })),
    ...partes.map((cuerpo) => ({ autor: 'bot' as const, tipo: 'texto' as const, cuerpo })),
  ];
  for (const [n, m] of salientes.entries()) await guardarMensajeWeb(sb, charla.id, m, new Date(desde + n));
  return { token: charla.web_token ?? null, partes, imagenes, documentos };
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
