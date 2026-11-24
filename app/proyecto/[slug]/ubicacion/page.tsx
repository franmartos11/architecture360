import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteProjectBySlug } from '@/data/project-repository';
import LocationView from '@/components/location/LocationView';
import { getProjectTypeConfig } from '@/lib/project-types';
import { projectCanonical } from '@/lib/project-canonical';
import { projectHasContent } from '@/lib/project-content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    alternates: { canonical: await projectCanonical(slug, '/ubicacion') },
    title: `${project.name} | Ubicación`,
    description: `Ubicación y puntos de interés cercanos a ${project.name}.`,
  };
}

export default async function UbicacionPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  // Sin contenido no hay sección: la barra no la ofrece y una entrada
  // directa (link viejo, buscador) da 404, como /recorrido sin tour.
  if (!project || !projectHasContent(project).location) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <LocationView project={project} typeConfig={typeConfig} />;
}
