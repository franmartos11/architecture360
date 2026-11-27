import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getSiteProjectBySlug } from '@/data/project-repository';
import UnitsListView from '@/components/units/UnitsListView';
import { getProjectTypeConfig } from '@/lib/project-types';

import { pluralize } from '@/lib/units';
interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  const t = await getT();
  if (!project) return { title: t('sitio.paginas.proyectoNoEncontrado') };
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, locale);
  const unitLabelLower = typeConfig.unitLabel.toLowerCase();
  return {
    alternates: await alternatesFor(slug, '/unidades', project.locales, locale),
    title: t('sitio.paginas.titulo', { nombre: project.name, seccion: pluralize(typeConfig.unitLabel, locale) }),
    description: t('sitio.paginas.unidadesDescripcion', { unidades: pluralize(unitLabelLower, locale), nombre: project.name }),
  };
}

export default async function UnidadesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getSiteProjectBySlug(slug);
  if (!project) notFound();

  // Los filtros llegan por query string para que un listado filtrado sea una
  // dirección a la que se puede volver desde la ficha de una unidad (y que se
  // puede compartir). La vista los sincroniza de vuelta a la URL — ver
  // UnitsListView.
  const initialQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v] as [string, string]] : [],
    ),
  ).toString();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, await getLocale());
  return <UnitsListView project={project} initialQuery={initialQuery} typeConfig={typeConfig} />;
}
