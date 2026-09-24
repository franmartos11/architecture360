'use client';

import { createContext, useContext } from 'react';

/**
 * El id del proyecto tal como lo resolvió el layout server-side al entrar
 * ("Seguir cargando" → cookie → este layout la lee UNA vez y lo pasa para
 * abajo). Se expone así, y no releyendo la cookie en cada fetch, porque la
 * cookie es compartida por todas las pestañas del navegador: si en otra
 * pestaña alguien entra a otro proyecto, la cookie cambia para TODAS, pero
 * esta pestaña sigue mostrando (con razón) el proyecto con el que entró.
 *
 * Sin esto, guardar acá después de ese cambio en la otra pestaña terminaba
 * escribiendo en el proyecto de la OTRA pestaña — silencioso, sin ningún
 * error — porque las rutas que resuelven "el proyecto activo" sin un
 * ?projectId= explícito leen esa misma cookie en el momento del pedido, no
 * en el momento en que esta página se abrió.
 *
 * Cubre las rutas que de verdad dependen de la cookie (ficha del proyecto,
 * alta de edificios/pisos/amenities/colaboradores, ajuste masivo de
 * unidades...). El resto de las rutas del admin no lo necesita: ya reciben
 * el id del edificio/piso/unidad que están tocando y resuelven el proyecto
 * a partir de ESE id, no de la cookie.
 */
const ActiveProjectIdContext = createContext<string | null>(null);

export function ActiveProjectIdProvider({ projectId, children }: { projectId: string; children: React.ReactNode }) {
  return <ActiveProjectIdContext.Provider value={projectId}>{children}</ActiveProjectIdContext.Provider>;
}

/** El id fijado al entrar a este proyecto. Fuera de un proyecto (ej. /admin/proyectos) es null. */
export function useActiveProjectId(): string | null {
  return useContext(ActiveProjectIdContext);
}

/**
 * Suma `projectId=` a una URL sin pisar los query params que ya tenga —
 * usar en cada fetch a una de las rutas que resuelve "el proyecto activo"
 * (ver de cuáles se trata en el comentario de arriba).
 */
export function withActiveProject(url: string, projectId: string | null): string {
  if (!projectId) return url; // fuera de contexto de proyecto: se deja como estaba (la propia ruta decide qué hacer sin uno)
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('projectId', projectId);
  return `${path}?${params.toString()}`;
}
