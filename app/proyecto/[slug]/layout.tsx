import { getProjectBasePath } from '@/lib/project-url';
import { ProjectBasePathProvider } from '@/lib/project-base-path-context';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}

// Calcula UNA vez por request si este visitante está viendo el proyecto por
// su subdominio propio o por /proyecto/[slug] en el dominio raíz, y lo
// distribuye a todo el árbol (páginas y Client Components anidados, sin
// importar cuántos niveles) vía contexto — ver
// lib/project-base-path-context.tsx. Evita que cada uno de los ~15
// componentes que arman un link interno del proyecto tenga que resolver
// esto por su cuenta.
export default async function ProjectLayout({ children, params }: LayoutProps) {
  const { slug } = await params;
  const basePath = await getProjectBasePath(slug);

  return <ProjectBasePathProvider basePath={basePath}>{children}</ProjectBasePathProvider>;
}
