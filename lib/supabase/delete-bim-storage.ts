import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BIM_BUCKET } from '@/lib/bim';

const CHUNK = 100;

/** Las columnas de una fila de bim_models que guardan archivos. */
export interface BimStorageFields {
  geometry_url: string | null;
  properties_url: string | null;
  cover_image: string | null;
  source_url: string | null;
  gallery_images: string[];
}

// Mismo criterio que toStorageKey() en delete-project-storage.ts, pero
// contra el bucket bim-models: de la URL pública saca la key relativa al
// bucket, que es lo que pide storage.remove(). Cualquier URL que no sea
// de este bucket no tiene nada que borrar acá.
function toStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/${BIM_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return url.slice(i + marker.length);
}

export function bimStorageKeys(models: BimStorageFields[]): string[] {
  const keys = new Set<string>();
  for (const m of models) {
    const urls = [m.geometry_url, m.properties_url, m.cover_image, m.source_url, ...(m.gallery_images ?? [])];
    for (const url of urls) {
      const key = toStorageKey(url);
      if (key) keys.add(key);
    }
  }
  return [...keys];
}

// Se llama ANTES de borrar las filas: borrar filas nunca borra los
// objetos de Storage (mismo motivo por el que existe
// deleteProjectStorageFiles).
export async function deleteBimStorageFiles(supabase: SupabaseClient, models: BimStorageFields[]): Promise<void> {
  const keys = bimStorageKeys(models);
  if (keys.length === 0) return;
  for (let i = 0; i < keys.length; i += CHUNK) {
    await supabase.storage.from(BIM_BUCKET).remove(keys.slice(i, i + CHUNK));
  }
}
