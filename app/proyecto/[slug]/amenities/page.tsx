import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteProject, getSiteProjectBySlug } from '@/data/project-repository';
import AmenitiesView from '@/components/amenities/AmenitiesView';
import { getProjectTypeConfig } from '@/lib/project-types';
import { projectCanonical } from '@/lib/project-canonical';
import { projectHasContent } from '@/lib/project-content';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edificio?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    alternates: { canonical: await projectCanonical(slug, '/amenities') },
    title: `${project.name} | Amenities`,
    description: `Conocé y recorré en 360° las amenities de ${project.name}.`,
  };
}

export default async function AmenitiesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edificio } = await searchParams;
  const view = await getSiteProject(slug);
  if (!view) notFound();
  const { project } = view;
  // Sin contenido no hay sección: la barra no la ofrece y una entrada
  // directa (link viejo, buscador) da 404, como /recorrido sin tour. En la
  // vista previa del borrador no: el dueño está cargando el proyecto y ve
  // el mensaje de vacío ("Todavía no hay…") en vez de un 404.
  if (!view.isDraftPreview && !projectHasContent(project).amenities) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <AmenitiesView project={project} initialBuildingFilter={edificio} typeConfig={typeConfig} />;
}
