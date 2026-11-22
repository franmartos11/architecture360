// Prepara los medios del cliente para un turno de la IA: baja las imágenes
// más recientes (Claude las ve) y transcribe los audios que falten (si hay
// servicio de transcripción). Todo lo que falla se registra y se sigue: el
// mensaje queda con su marca de texto, como antes.
// Sin imports de next/react: corre con tsx fuera de Next.
import type { WaMensaje } from '@/types/whatsapp-bot';
import type { ImagenParaIa } from './ia/historial';

/** Imágenes del cliente que ve la IA por turno (las más nuevas): cada una cuesta tokens. */
export const MAX_IMAGENES_IA = 3;
/** Audios sin transcribir que se procesan por turno (los más nuevos). */
export const MAX_AUDIOS_POR_TURNO = 3;
/** La API de Claude no acepta imágenes de más de 5 MB. */
export const TOPE_IMAGEN_IA_BYTES = 5 * 1024 * 1024;
/** Los servicios tipo Whisper aceptan hasta 25 MB. */
export const TOPE_AUDIO_BYTES = 24 * 1024 * 1024;

const MIME_IMAGEN: Record<string, ImagenParaIa['mediaType']> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

const extension = (path: string) => path.split('.').pop()?.toLowerCase() ?? '';

export type Medio = { data: Uint8Array; mime: string | null };

export type DepsMediosIa = {
  /** Baja un archivo del bucket wa-medios; null si no está. */
  bajar(path: string): Promise<Medio | null>;
  /** Sin esto los audios quedan como "[El cliente mandó un audio]". */
  transcribir?: (a: { data: Uint8Array; mime: string; nombre: string }) => Promise<string | null>;
  guardarTranscripcion?(mensajeId: string, texto: string): Promise<void>;
  log?: (m: string) => void;
};

const mensajeDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function prepararMediosIa(
  msgs: WaMensaje[],
  deps: DepsMediosIa,
): Promise<{ mensajes: WaMensaje[]; imagenes: Map<string, ImagenParaIa> }> {
  const log = deps.log ?? (() => {});
  const delCliente = (tipo: WaMensaje['tipo']) =>
    msgs.filter((m) => m.autor === 'cliente' && m.tipo === tipo && !!m.media_path).reverse(); // más nuevos primero

  const imagenes = new Map<string, ImagenParaIa>();
  for (const m of delCliente('imagen')) {
    if (imagenes.size >= MAX_IMAGENES_IA) break;
    const mediaType = MIME_IMAGEN[extension(m.media_path!)];
    if (!mediaType) continue;
    try {
      const medio = await deps.bajar(m.media_path!);
      if (!medio || medio.data.byteLength === 0 || medio.data.byteLength > TOPE_IMAGEN_IA_BYTES) continue;
      imagenes.set(m.id, { mediaType, data: Buffer.from(medio.data).toString('base64') });
    } catch (e) {
      log(`[medios-ia] no pude bajar una imagen (${m.id}): ${mensajeDe(e)}`);
    }
  }

  const transcriptas = new Map<string, string>();
  if (deps.transcribir) {
    const pendientes = delCliente('audio').filter((m) => !m.transcripcion?.trim()).slice(0, MAX_AUDIOS_POR_TURNO);
    for (const m of pendientes) {
      try {
        const medio = await deps.bajar(m.media_path!);
        if (!medio || medio.data.byteLength === 0 || medio.data.byteLength > TOPE_AUDIO_BYTES) continue;
        const ext = extension(m.media_path!) || 'ogg';
        const texto = (
          await deps.transcribir({ data: medio.data, mime: medio.mime || `audio/${ext}`, nombre: `audio.${ext}` })
        )?.trim();
        if (!texto) continue;
        transcriptas.set(m.id, texto);
        await deps.guardarTranscripcion?.(m.id, texto);
      } catch (e) {
        log(`[medios-ia] no pude transcribir un audio (${m.id}): ${mensajeDe(e)}`);
      }
    }
  }

  const mensajes = transcriptas.size
    ? msgs.map((m) => (transcriptas.has(m.id) ? { ...m, transcripcion: transcriptas.get(m.id)! } : m))
    : msgs;
  return { mensajes, imagenes };
}
