// Achica fotos en el navegador antes de subirlas. Pensado para la carga
// desde la obra: una foto de celular pesa entre 5 y 15 MB y, con datos
// móviles, subir doce así es eterno (y el tope de la subida es 15 MB). Con
// 2560 px de lado y calidad 0.82 queda en ~0,5–1,5 MB y se sigue viendo
// bien a pantalla completa en el sitio.
//
// Está partido en dos: la DECISIÓN (qué se comprime, a qué tamaño y en qué
// formato) es pura y se prueba en Node; el DIBUJADO (decodificar y pasar
// por un canvas) solo existe en el navegador. Cualquier falla en el
// dibujado devuelve el archivo original: comprimir es una optimización,
// nunca una razón para que una foto no suba.
//
// No es para todo: las panorámicas 360° y los planos necesitan la
// resolución completa, por eso los uploaders lo traen apagado por defecto.

export interface CompressOptions {
  /** Lado más largo de la salida, en px. */
  maxSide?: number;
  /** Calidad de jpeg / webp, de 0 a 1. */
  quality?: number;
  /** Por debajo de este peso (y si ya entra en maxSide) se sube tal cual. */
  skipBelowBytes?: number;
}

export const COMPRESS_DEFAULTS: Required<CompressOptions> = {
  maxSide: 2560,
  quality: 0.82,
  skipBelowBytes: 1.5 * 1024 * 1024,
};

/**
 * Formatos que vale la pena pasar por el canvas. gif (puede ser animado) y
 * svg (vectorial) quedan afuera: el canvas los aplanaría. heic/heif entran
 * porque el servidor no los acepta: si el navegador los sabe decodificar
 * (Safari), salen como jpeg; si no, se intenta subir el original y el
 * servidor avisa.
 */
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
/** Formatos que el servidor no acepta: se convierten aunque sean livianos. */
const MUST_CONVERT = new Set(['image/heic', 'image/heif']);

export function isCompressibleType(type: string): boolean {
  return COMPRESSIBLE.has(type.toLowerCase());
}

/** Escala proporcional para que el lado más largo no pase `maxSide`. Nunca agranda. */
export function fitWithin(width: number, height: number, maxSide: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide || longest <= 0) return { width, height };
  const k = maxSide / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

/** webp se queda en webp (ya es liviano y conserva transparencia); el resto sale jpeg. */
export function outputTypeFor(type: string): 'image/jpeg' | 'image/webp' {
  return type.toLowerCase() === 'image/webp' ? 'image/webp' : 'image/jpeg';
}

/** "IMG_0042.HEIC" → "IMG_0042.jpg": la extensión tiene que coincidir con lo que se sube (la ruta arma el path con ella). */
export function renameFor(name: string, outType: string): string {
  const ext = outType === 'image/webp' ? 'webp' : 'jpg';
  const base = name.replace(/\.[^./\\]*$/, '') || 'foto';
  return `${base}.${ext}`;
}

/**
 * ¿Hay que pasarlo por el canvas? Sin medidas (todavía no se decodificó)
 * se contesta con lo que se sabe: un archivo liviano podría igual ser
 * enorme en píxeles, así que solo se descarta de entrada por tipo.
 */
export function shouldCompress(
  file: { type: string; size: number },
  dims: { width: number; height: number } | null,
  opts: CompressOptions = {},
): boolean {
  const { maxSide, skipBelowBytes } = { ...COMPRESS_DEFAULTS, ...opts };
  if (!isCompressibleType(file.type)) return false;
  if (MUST_CONVERT.has(file.type.toLowerCase())) return true;
  if (!dims) return true;
  const fits = Math.max(dims.width, dims.height) <= maxSide;
  return !(fits && file.size < skipBelowBytes);
}

/**
 * ¿Conviene quedarse con el resultado? Si no hubo que achicar las medidas
 * y el comprimido pesa igual o más (un png chico ya optimizado, un jpeg de
 * baja calidad), se sube el original. Lo que no entra en el servidor
 * (heic) se queda siempre con el convertido.
 */
export function keepCompressed(original: { type: string; size: number }, resultSize: number, resized: boolean): boolean {
  if (MUST_CONVERT.has(original.type.toLowerCase())) return true;
  return resized || resultSize < original.size;
}

// ─── Navegador ───────────────────────────────────────────────────────

async function decode(file: File): Promise<ImageBitmap> {
  // 'from-image' aplica la rotación EXIF: el canvas no la conserva, y una
  // foto vertical del celular saldría acostada.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * Devuelve la foto achicada, o el original si no hace falta o si algo
 * falla (navegador sin createImageBitmap, formato que no decodifica,
 * memoria). Nunca rechaza.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const o = { ...COMPRESS_DEFAULTS, ...opts };
  if (!shouldCompress(file, null, o)) return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await decode(file);
    const dims = { width: bitmap.width, height: bitmap.height };
    if (!shouldCompress(file, dims, o)) return file;

    const target = fitWithin(dims.width, dims.height, o.maxSide);
    const outType = outputTypeFor(file.type);
    const canvas = document.createElement('canvas');
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    if (outType === 'image/jpeg') {
      // jpeg no tiene transparencia: sin fondo, lo transparente de un png sale negro.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, target.width, target.height);
    }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, target.width, target.height);
    const blob = await toBlob(canvas, outType, o.quality);
    // Safari viejo puede ignorar webp y devolver png: si el tipo no es el pedido, mejor el original.
    if (!blob || blob.type !== outType) return file;
    const resized = target.width !== dims.width || target.height !== dims.height;
    if (!keepCompressed(file, blob.size, resized)) return file;
    return new File([blob], renameFor(file.name, outType), { type: outType, lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
