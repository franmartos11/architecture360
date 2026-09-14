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

// A diferencia de toStorageKey() en delete-project-storage.ts (que busca
// la marca "/project-media/" en cualquier parte de la URL), acá matcheamos
// contra el PREFIJO real de URL pública de Supabase Storage. gallery_images
// acepta URLs libres (la opción "agregar por URL" de MultiImageUploader),
// así que un string arbitrario que solo CONTENGA la substring "/bim-models/"
// en cualquier posición (sin ser realmente una URL de este proyecto de
// Supabase) no debe tratarse como una key válida del bucket — eso dejaría
// borrar, a través de un valor inventado, un objeto ajeno si su key se
// llegara a adivinar u obtener por otro medio. El bucket en sí no se puede
// "escapar" (storage.from(BIM_BUCKET) lo fija del lado del servidor), pero
// vale la pena no tratar como válida una key que no vino de una URL nuestra.
function toStorageKey(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BIM_BUCKET}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
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
