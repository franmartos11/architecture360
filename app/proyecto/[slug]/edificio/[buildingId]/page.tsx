import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import FloorPlanWrapper from '@/components/floorplan/FloorPlanWrapper';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { getProjectBasePath } from '@/lib/project-base-path';

import { pluralize } from '@/lib/units';
interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ piso?: string }>;
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

  const unitLabelLower = typeConfig.unitLabel.toLowerCase();
  const title = typeConfig.hasFloorStep
    ? t('sitio.paginas.titulo', { nombre: building.name, seccion: t('sitio.paginas.planoDePisos') })
    : t('sitio.paginas.titulo', { nombre: building.name, seccion: t('sitio.paginas.planoDeUnidades', { unidad: typeConfig.unitLabel, unidades: pluralize(typeConfig.unitLabel, locale) }) });
  const description = typeConfig.hasFloorStep
    ? t('sitio.paginas.edificioDescripcionPisos', { edificio: building.name, nombre: project.name })
    : t('sitio.paginas.edificioDescripcion', { unidad: unitLabelLower, unidades: pluralize(unitLabelLower, locale), edificio: building.name, nombre: project.name });
  const image = project.masterplanImage || undefined;

  return {
    alternates: await alternatesFor(slug, `/edificio/${buildingId}`, project.locales, locale),
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined, locale: locale === 'en' ? 'en_US' : 'es_AR' },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function BuildingPage({ params, searchParams }: PageProps) {
  const { slug, buildingId } = await params;
  const { piso } = await searchParams;

  const project = await getSiteProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);

  if (!project || !building) notFound();

  const initialFloor = piso ? parseInt(piso, 10) : 1;
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, await getLocale());

  // Una casa ES la unidad — no hay plano de pisos que navegar, así que el
  // "edificio" público de una casa no tiene nada propio que mostrar: se
  // salta directo a la ficha de su única unidad.
  if (!typeConfig.hasUnitStep) {
    const unit = project.units.find(u => u.buildingId === building.id);
    if (unit) {
      const basePath = await getProjectBasePath(slug);
      redirect(`${basePath}/edificio/${buildingId}/unidad/${unit.id}`);
    }
  }

  return (
    <FloorPlanWrapper
      building={building}
      units={project.units}
      projectSlug={slug}
      amenities={project.amenities}
      pointsOfInterest={project.pointsOfInterest}
      initialFloor={initialFloor}
      typeConfig={typeConfig}
      buildings={project.buildings.map(b => ({ id: b.id, name: b.name }))}
      bimModels={project.bimModels}
    />
  );
}
