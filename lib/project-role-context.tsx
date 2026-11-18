'use client';

import { createContext, useContext } from 'react';
import type { ProjectRole } from '@/lib/project-roles';

// Mismo patrón que ProjectTypeContext: se provee una vez en el shell del
// proyecto para que cualquier componente anidado sepa qué puede hacer el
// usuario sin recibir el rol por props. El default es 'editor', el rol más
// restrictivo: si falta el provider, la UI oculta de más en vez de mostrar
// controles que el servidor igual rechazaría.
const ProjectRoleContext = createContext<ProjectRole>('editor');

export function ProjectRoleProvider({
  role,
  children,
}: {
  role: ProjectRole;
  children: React.ReactNode;
}) {
  return <ProjectRoleContext.Provider value={role}>{children}</ProjectRoleContext.Provider>;
}

export function useProjectRole(): ProjectRole {
  return useContext(ProjectRoleContext);
}
