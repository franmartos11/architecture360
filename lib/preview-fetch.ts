// Pedido compartido a /api/admin/project/preview.
//
// Ese endpoint arma el proyecto público completo (edificios, pisos, unidades,
// amenities…) y varias cosas del panel lo piden a la vez: el estado de
// publicación (layout) y la pantalla que se abre (Sitio, Estilo, el editor de
// la calculadora). Antes eran dos reconstrucciones completas por navegación.
//
// - Pedidos simultáneos a la misma URL comparten UNA respuesta.
// - Una respuesta de hace menos de REUSE_MS se reutiliza (pasar de una pantalla
//   a otra no es un cambio).
// - `force: true` (recargar después de guardar) NO reutiliza nada y no se
//   cuelga de un pedido que ya estaba en vuelo: ese podría haber salido antes
//   del cambio y traer datos viejos.
//
// Cada quien recibe su propia copia (structuredClone): las pantallas guardan el
// proyecto en su estado y no deben poder pisarse entre sí.
import type { Project } from '@/types';

const REUSE_MS = 2000;

const inflight = new Map<string, Promise<unknown>>();
const recent = new Map<string, { at: number; data: unknown }>();

/** Lo que devuelve GET /api/admin/project/preview (`error` cuando no es un 2xx). */
export interface ProjectPreviewResponse {
  project?: Project;
  error?: string;
}

export async function fetchProjectPreview<T = ProjectPreviewResponse>(
  url: string,
  { force = false }: { force?: boolean } = {}
): Promise<T> {
  if (!force) {
    const hit = recent.get(url);
    if (hit && Date.now() - hit.at < REUSE_MS) return structuredClone(hit.data) as T;
    const pending = inflight.get(url);
    if (pending) return structuredClone(await pending) as T;
  }

  const request = fetch(url)
    .then(async res => {
      const data = await res.json();
      // Solo las respuestas buenas se recuerdan: un 401/500 no debe servirse de nuevo.
      if (res.ok) recent.set(url, { at: Date.now(), data });
      else recent.delete(url);
      return data;
    })
    .finally(() => {
      // Un pedido forzado más nuevo ya pudo haber ocupado el lugar: no pisarlo.
      if (inflight.get(url) === request) inflight.delete(url);
    });
  inflight.set(url, request);
  return structuredClone(await request) as T;
}

/** Solo para tests. */
export function clearPreviewFetchCache() {
  inflight.clear();
  recent.clear();
}
