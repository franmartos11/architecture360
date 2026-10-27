'use client';

import { ProjectMenuButton } from '@/components/ui/ProjectMenu';
import { useProjectNav } from '@/lib/project-nav-context';

// Botón "Menú" de la ficha de unidad (vista inmersiva), que no muestra la
// barra global: abre el mismo menú único que la web (ProjectMenu). Solo
// aparece cuando la barra global está oculta (useProjectNav().immersive).
export default function ProjectWebLink({ variant = 'light' }: { variant?: 'light' }) {
  const nav = useProjectNav();
  if (!nav?.immersive) return null;
  return <ProjectMenuButton info={nav} variant={variant} />;
}
