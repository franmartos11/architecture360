import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AerialViewWrapper from '@/components/aerial/AerialViewWrapper';
import { getSiteProject, getSiteProjectBySlug } from '@/data/project-repository';
import { projectCanonical } from '@/lib/project-canonical';
import { projectHasContent } from '@/lib/project-content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  // "Fachada": el mismo nombre que le dan la barra, el menú y las migas.
  return {
    alternates: { canonical: await projectCanonical(slug, '/masterplan') },
    title: `${project.name} | Fachada`,
    description: project.description,
  };
}

export default async function ProjectMasterplanPage({ params }: PageProps) {
  const { slug } = await params;
  const view = await getSiteProject(slug);
  if (!view) notFound();
  const { project } = view;
  // Sin contenido no hay sección: la barra no la ofrece y una entrada
  // directa (link viejo, buscador) da 404, como /recorrido sin tour. En la
  // vista previa del borrador no: el dueño está cargando el proyecto y ve
  // el mensaje de vacío ("Todavía no hay…") en vez de un 404.
  if (!view.isDraftPreview && !projectHasContent(project).facade) notFound();

  return <AerialViewWrapper project={project} />;
}
