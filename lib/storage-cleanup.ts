import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Limpieza de archivos que un guardado dejó sin referencia en el storage.
 * Las dos primeras funciones son puras (se testean sin Supabase); la tercera
 * es la que toca el bucket.
 */

/**
 * De una URL pública de Supabase Storage (`…/storage/v1/object/public/<bucket>/<path>`)
 * saca `<path>`. null si no es de ese bucket (URL externa, otro bucket, basura):
 * lo que no es nuestro no se borra.
 */
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const marker = `/storage/v1/object/public/${bucket}/`;
  const at = pathname.indexOf(marker);
  if (at === -1) return null;
  try {
    const path = decodeURIComponent(pathname.slice(at + marker.length));
    // Ni vacío ni con ".." : el path va tal cual a remove().
    return path && !path.split('/').includes('..') ? path : null;
  } catch {
    return null;
  }
}

/**
 * Paths del bucket (dentro de `folder`) cuyas URLs estaban en `before` y ya no
 * están en `after`. Sin duplicados: una misma URL puede repetirse en dos
 * entradas y solo es huérfana si no queda en ninguna.
 */
export function orphanedMediaPaths(
  before: string[],
  after: string[],
  { bucket, folder }: { bucket: string; folder: string }
): string[] {
  const kept = new Set(after.map(url => storagePathFromPublicUrl(url, bucket)).filter((p): p is string => p !== null));
  const orphans = new Set<string>();
  for (const url of before) {
    const path = storagePathFromPublicUrl(url, bucket);
    if (path && path.startsWith(`${folder}/`) && !kept.has(path)) orphans.add(path);
  }
  return [...orphans];
}

/**
 * Borra del bucket los huérfanos. Corre DESPUÉS de que el guardado salió bien,
 * así que nunca lanza: si falla queda un archivo suelto (como pasaba siempre
 * antes), no un guardado perdido.
 */
export async function removeOrphanedMedia(
  before: string[],
  after: string[],
  opts: { bucket: string; folder: string }
): Promise<void> {
  try {
    const paths = orphanedMediaPaths(before, after, opts);
    if (paths.length === 0) return;
    const storage = createAdminClient().storage.from(opts.bucket);
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await storage.remove(paths.slice(i, i + 100));
      if (error) console.error('[storage-cleanup] no se pudieron borrar archivos huérfanos', error);
    }
  } catch (err) {
    console.error('[storage-cleanup] falló la limpieza de archivos huérfanos', err);
  }
}
