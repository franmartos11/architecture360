// Recepción (spec §7.4): cada message_create de una sesión pasa por acá.
// Guarda lo que corresponde y, si es un mensaje del cliente, avisa al
// agrupador; si responde o no la IA lo decide el turno (correrTurnoIA).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaBot, WaTipo } from '@/types/whatsapp-bot';
import type * as Repo from '../repo';
import { HORAS_MODO_HUMANO, normalizarTelefono } from '../reglas';
import type { Agrupador } from './agrupador';
import type { MensajeEntrante } from './mensaje';
import type { EnSerie } from './serie';

const MS_HORA = 60 * 60 * 1000;

/** Tipos cuyo archivo se baja y se guarda en Storage (videos y stickers no). */
const CON_MEDIO: ReadonlySet<WaTipo> = new Set(['imagen', 'audio', 'documento']);

export type DepsRecepcion = {
  repo: Pick<typeof Repo, 'obtenerOCrearConversacion' | 'guardarMensaje' | 'ponerModoHumano'>;
  sb: SupabaseClient;
  /** El bot con su vinculado_at vigente (se fija al conectar, antes de procesar mensajes). */
  bot: WaBot;
  subirMedio(convId: string, waId: string, m: { mime: string; data: Buffer }): Promise<string>;
  /** waId que mandó la cola. */
  esDeLaCola(waId: string): boolean;
  /** Eco de un envío de la cola cuyo waId todavía no se conoce (ver EnviosPropios). */
  esEnvioEnCurso(m: MensajeEntrante): boolean;
  agrupador: Pick<Agrupador, 'avisar'>;
  /**
   * ¿WhatsApp Web tiene mensajes de este chat anteriores a `antesDe`? Solo se
   * consulta al crear la conversación (spec §6, teléfono en uso).
   */
  historialPrevio?(wid: string, antesDe: Date): Promise<boolean>;
  ahora(): Date;
  /** Serializa las escrituras de una misma conversación. Sin esto, corre directo. */
  enSerie?: EnSerie;
  log?: (m: string) => void;
};

const EXTENSIONES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
};

export function extensionDeMime(mime: string): string {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  return EXTENSIONES[base] ?? 'bin';
}

/** `<project_id>/<conv_id>/<waId>.<ext>` en el bucket wa-medios. */
export function rutaMedio(projectId: string, convId: string, waId: string, mime: string): string {
  const nombre = waId.replace(/[^\w@.-]/g, '_');
  return `${projectId}/${convId}/${nombre}.${extensionDeMime(mime)}`;
}

/** La clave de la conversación: teléfono normalizado, o el wid si no hay (un @lid sin resolver). */
export function claveContacto(m: Pick<MensajeEntrante, 'numero' | 'wid'>): string {
  return normalizarTelefono(m.numero ?? '') ?? m.wid;
}

export async function procesarMensaje(deps: DepsRecepcion, m: MensajeEntrante): Promise<void> {
  // 1. Grupos, estados, canales y listas de difusión: nada que ver con el bot.
  if (m.esGrupo || m.esEstado) return;

  // 2. Saliente: si lo mandó la cola ya queda registrado por el despacho.
  if (m.deMi && (deps.esDeLaCola(m.waId) || deps.esEnvioEnCurso(m))) return;

  const log = deps.log ?? ((t: string) => console.error(t));
  const enSerie: EnSerie = deps.enSerie ?? ((_clave, fn) => fn());

  const historialPrevio = deps.historialPrevio;
  const conv = await deps.repo.obtenerOCrearConversacion(
    deps.sb,
    deps.bot,
    { numero: claveContacto(m), wid: m.wid, nombre: m.nombre },
    m.at,
    historialPrevio ? { tieneHistorialPrevio: (vinculo) => historialPrevio(m.wid, vinculo) } : {},
  );

  // 3. Medios a Storage (fuera de la serie: puede tardar). Si falla, el mensaje se guarda igual.
  let mediaPath: string | null = null;
  if (CON_MEDIO.has(m.tipo)) {
    try {
      const medio = await m.descargarMedio();
      if (medio) mediaPath = await deps.subirMedio(conv.id, m.waId, medio);
    } catch (e) {
      log(`[recepcion] no pude guardar el medio de un mensaje (${conv.id}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await enSerie(conv.id, async () => {
    const r = await deps.repo.guardarMensaje(deps.sb, {
      conversacion_id: conv.id,
      wa_id: m.waId,
      direccion: m.deMi ? 'saliente' : 'entrante',
      autor: m.deMi ? 'telefono' : 'cliente',
      tipo: m.tipo,
      cuerpo: m.cuerpo || null,
      media_path: mediaPath,
      enviado_at: m.at.toISOString(),
      ack: null,
    });
    if (r === 'duplicado') return;

    if (m.deMi) {
      // Escribieron desde el celular del número: atiende una persona por 12 h.
      await deps.repo.ponerModoHumano(
        deps.sb,
        conv.id,
        new Date(deps.ahora().getTime() + HORAS_MODO_HUMANO * MS_HORA),
      );
      return;
    }
    deps.agrupador.avisar(conv.id);
  });
}
