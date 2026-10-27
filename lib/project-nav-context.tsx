'use client';

import { createContext, useContext } from 'react';
import type { ProjectNavInfo } from '@/lib/project-nav';

// Lo provee ProjectChrome: datos de navegación del proyecto. null fuera del
// sitio público de un proyecto (ej. un visor usado en otro contexto) — los
// visores lo usan para saber si la barra global ya está arriba.
export type ProjectNavContextValue = ProjectNavInfo;

const ProjectNavContext = createContext<ProjectNavContextValue | null>(null);

export const ProjectNavProvider = ProjectNavContext.Provider;

export function useProjectNav(): ProjectNavContextValue | null {
  return useContext(ProjectNavContext);
}
