'use client';

import { createContext, useContext, type ReactNode } from 'react';

// Ver lib/project-base-path.ts:getProjectBasePath — mismo prefijo, disponible acá
// sin volver a pegarle a next/headers en cada Client Component. El
// Provider se monta una única vez en app/proyecto/[slug]/layout.tsx (Server
// Component, calcula el valor con headers() y lo pasa para acá) y de ahí
// para abajo cualquier Client Component de todo el árbol puede leerlo con
// useProjectBasePath() sin que haga falta pasarlo como prop manualmente por
// cada componente intermedio (Wrapper, tab, modal...).
const ProjectBasePathContext = createContext('');

export function ProjectBasePathProvider({ basePath, children }: { basePath: string; children: ReactNode }) {
  return <ProjectBasePathContext.Provider value={basePath}>{children}</ProjectBasePathContext.Provider>;
}

/**
 * Prefijo para armar un link INTERNO del proyecto — usar como
 * `${useProjectBasePath()}/masterplan` en vez de hardcodear
 * `/proyecto/${slug}/masterplan`. Vacío cuando se está viendo por el
 * subdominio propio del proyecto, `/proyecto/${slug}` en el dominio raíz.
 */
export function useProjectBasePath(): string {
  return useContext(ProjectBasePathContext);
}
