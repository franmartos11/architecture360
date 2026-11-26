import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteProject, getSiteProjectBySlug } from '@/data/project-repository';
import LocationView from '@/components/location/LocationView';
import { getProjectTypeConfig } from '@/lib/project-types';
import { projectHasContent } from '@/lib/project-content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    alternates: await alternatesFor(slug, '/ubicacion', project.locales, locale),
    title: `${project.name} | Ubicación`,
    description: `Ubicación y puntos de interés cercanos a ${project.name}.`,
  };
}

export default async function UbicacionPage({ params }: PageProps) {
  const { slug } = await params;
  const view = await getSiteProject(slug);
  if (!view) notFound();
  const { project } = view;
  // Sin contenido no hay sección: la barra no la ofrece y una entrada
  // directa (link viejo, buscador) da 404, como /recorrido sin tour. En la
  // vista previa del borrador no: el dueño está cargando el proyecto y ve
  // el mensaje de vacío ("Todavía no hay…") en vez de un 404.
  if (!view.isDraftPreview && !projectHasContent(project).location) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <LocationView project={project} typeConfig={typeConfig} />;
}
