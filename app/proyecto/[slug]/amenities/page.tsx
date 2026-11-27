import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteProject, getSiteProjectBySlug } from '@/data/project-repository';
import AmenitiesView from '@/components/amenities/AmenitiesView';
import { getProjectTypeConfig } from '@/lib/project-types';
import { projectHasContent } from '@/lib/project-content';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edificio?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  const t = await getT();
  if (!project) return { title: t('sitio.paginas.proyectoNoEncontrado') };
  return {
    alternates: await alternatesFor(slug, '/amenities', project.locales, locale),
    title: t('sitio.paginas.titulo', { nombre: project.name, seccion: t('nav.amenities') }),
    description: t('sitio.paginas.amenitiesDescripcion', { nombre: project.name }),
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

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, await getLocale());
  return <AmenitiesView project={project} initialBuildingFilter={edificio} typeConfig={typeConfig} />;
}
