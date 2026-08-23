'use client';

import { createContext, useContext } from 'react';
import { getProjectTypeConfig, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE, type ProjectTypeConfig } from '@/lib/project-types';

// Provisto una sola vez en ProjectAdminShell (que envuelve TODAS las
// páginas de un proyecto en el admin) para que cualquier componente
// anidado — por más profundo que esté, ej. el editor de unidades dentro
// de un piso — pueda saber qué tipo de proyecto es sin tener que volver
// a pedirlo ni recibirlo por props a través de cada capa intermedia.
const ProjectTypeContext = createContext<ProjectTypeConfig>(getProjectTypeConfig(DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE));

export function ProjectTypeProvider({
  projectType,
  saleMode,
  children,
}: {
  projectType: string;
  saleMode: string;
  children: React.ReactNode;
}) {
  return (
    <ProjectTypeContext.Provider value={getProjectTypeConfig(projectType, saleMode)}>
      {children}
    </ProjectTypeContext.Provider>
  );
}

export function useProjectTypeConfig(): ProjectTypeConfig {
  return useContext(ProjectTypeContext);
}
