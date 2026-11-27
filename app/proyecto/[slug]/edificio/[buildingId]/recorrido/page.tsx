import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { getSunAzimuths } from '@/lib/sun-position';
import { getProjectBasePath } from '@/lib/project-base-path';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ focus?: string; embed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, buildingId } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  const t = await getT();
  if (!project) return { title: t('sitio.paginas.proyectoNoEncontrado') };
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, locale);
  const building = project.buildings.find(b => b.id === buildingId);
  if (!building) {
    return { title: t(typeConfig.buildingLabelGender === 'f' ? 'sitio.paginas.edificioNoEncontrada' : 'sitio.paginas.edificioNoEncontrado', { edificio: typeConfig.buildingLabel }) };
  }
  return {
    alternates: await alternatesFor(slug, `/edificio/${buildingId}/recorrido`, project.locales, locale),
    title: t('sitio.paginas.titulo', { nombre: building.name, seccion: t('sitio.paginas.amenities360') }),
    description: t('sitio.paginas.edificioRecorridoDescripcion', { nombre: building.name }),
  };
}

export default async function BuildingTourPage({ params, searchParams }: PageProps) {
  const { slug, buildingId } = await params;
  const { focus, embed } = await searchParams;
  const isEmbed = embed === 'true';
  const project = await getSiteProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);
  if (!building || !building.amenitiesTour) notFound();

  // La ubicación (lat/lng) es del proyecto, no de la torre.
  const sunAzimuths = project?.latitude != null ? getSunAzimuths(project.latitude) : null;
  const basePath = await getProjectBasePath(slug);
  const t = await getT();

  return (
    <CommonAreasTourWrapper
      projectName={building.name}
      projectSlug={slug}
      tourData={building.amenitiesTour}
      focusNodeId={focus}
      label={t('sitio.paginas.recorridoDe', { nombre: building.name })}
      backHref={`${basePath}/edificio/${buildingId}`}
      backLabel={t('sitio.paginas.volverA', { nombre: building.name })}
      embed={isEmbed}
      orientationDegrees={building.tourOrientationDegrees}
      sunAzimuths={sunAzimuths}
    />
  );
}
