import 'server-only';
import sharp from 'sharp';

// Imágenes de la ficha PDF de una unidad. react-pdf solo dibuja JPG y PNG y
// las imágenes de los proyectos pueden ser WebP o SVG: se bajan y se pasan a
// JPEG. Cualquier problema (host ajeno, lenta, enorme, rota) omite la imagen
// y la ficha sale igual.
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

const TIMEOUT_MS = 8_000;
const MAX_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1600;
const STATIC_IMAGE_PATH = /^\/(?!\/|api\/)[^?#\\]*\.(?:jpe?g|png|webp|avif|gif|svg)$/i;

/** Lee el cuerpo cortando apenas pasa el tope (un cuerpo sin content-length no ocupa memoria de más). */
async function readCapped(res: Response, max: number): Promise<Buffer> {
  if (!res.body) return Buffer.alloc(0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new Error(`demasiado grande (más de ${max} bytes)`);
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Mismos hosts que images.remotePatterns de next.config: evita que la ruta pida direcciones internas. */
export function isAllowedImageUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== 'https:') return false;
  const host = u.hostname.toLowerCase();
  return host === 'images.unsplash.com' || (host.endsWith('.supabase.co') && host.length > '.supabase.co'.length);
}

/**
 * URL a descargar: una absoluta de un host permitido, o una ruta del propio
 * sitio ("/units/x.jpg", archivos de public/ de los proyectos demo) resuelta
 * contra el origen de la app. Cualquier otra cosa → null.
 */
export function resolveImageUrl(url: string, appOrigin?: string): string | null {
  if (url.startsWith('/')) {
    // Solo archivos estáticos (nada de /api/…: la ficha no puede pedirse a sí misma).
    if (!appOrigin || !STATIC_IMAGE_PATH.test(url)) return null;
    try {
      const base = new URL(appOrigin);
      const u = new URL(url, base);
      return u.origin === base.origin ? u.href : null;
    } catch {
      return null;
    }
  }
  return isAllowedImageUrl(url) ? url : null;
}

export async function loadPdfImage(raw: string | undefined | null, fetchImpl: typeof fetch = fetch, appOrigin?: string): Promise<Buffer | null> {
  const url = raw ? resolveImageUrl(raw, appOrigin) : null;
  if (!url) return null;
  try {
    // Sin seguir redirecciones: un host permitido no puede mandar a otro.
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_BYTES) throw new Error(`demasiado grande (${declared} bytes)`);
    const buf = await readCapped(res, MAX_BYTES);
    return await sharp(buf)
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch (err) {
    console.error('[ficha] no se pudo usar la imagen', url, err);
    return null;
  }
}
