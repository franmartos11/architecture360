'use client';

import { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectNavInfo } from '@/lib/project-nav';

// Lo provee ProjectChrome: datos de navegación del proyecto + si la ruta
// actual es una vista inmersiva (sin nav global). null fuera del sitio
// público de un proyecto (ej. un visor usado en otro contexto).
// exploreRoute: vista de "Explorar 3D" — en pantallas anchas la barra
// completa la cubre (ver ProjectChrome), así que el visor esconde la suya.
export type ProjectNavContextValue = ProjectNavInfo & { immersive: boolean; exploreRoute: boolean };

const ProjectNavContext = createContext<ProjectNavContextValue | null>(null);

export const ProjectNavProvider = ProjectNavContext.Provider;

export function useProjectNav(): ProjectNavContextValue | null {
  return useContext(ProjectNavContext);
}

// ── Último tramo de las migas de Explorar 3D ─────────────────────────
// El ángulo de la fachada, el piso de las plantas o el espacio del
// recorrido viven en el estado de cada visor, no en la barra. En vez de
// subir ese estado, la fila de contexto de la barra expone un hueco (su
// elemento DOM, vía este contexto) y el visor renderiza ahí con un portal
// — así los controles siguen cableados al estado del visor. null cuando no
// hay fila de contexto (fuera de Explorar 3D o fuera del sitio público).
const SceneCrumbTargetContext = createContext<HTMLElement | null>(null);

export const SceneCrumbTargetProvider = SceneCrumbTargetContext.Provider;

export function SceneCrumb({ children }: { children: React.ReactNode }) {
  const target = useContext(SceneCrumbTargetContext);
  return target ? createPortal(children, target) : null;
}

// Si hay hueco de migas — para que un visor que mueve un control a la barra
// sepa que puede esconder su versión flotante (desde 768px, donde se ve la
// fila de contexto).
export function useHasSceneCrumb(): boolean {
  return useContext(SceneCrumbTargetContext) != null;
}
