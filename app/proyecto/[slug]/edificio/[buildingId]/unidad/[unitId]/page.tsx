import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale } from '@/lib/i18n/server';
import { crearT } from '@/lib/i18n/t';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import UnitViewerWrapper from '@/components/unit/UnitViewerWrapper';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { getProjectBasePath } from '@/lib/project-base-path';
import type { UnitViewTab } from '@/types';
import { unitIsDwelling, unitCategory, unitCategoryLabel } from '@/lib/units';
import { etiquetaCatalogo } from '@/lib/i18n/catalogo';
import { pickUnitView } from '@/lib/floor-views';
import { findSiteUnit, unitBimModel } from '@/lib/site-unit';

const VALID_TABS: UnitViewTab[] = ['planta3d', 'tour360', 'plano', 'galeria', 'vista', 'amenities', 'ubicacion'];

interface PageProps {
  params: Promise<{ slug: string; buildingId: string; unitId: string }>;
  searchParams: Promise<{ tab?: string; volver?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, buildingId, unitId } = await params;
  const locale = await getLocale();
  // Misma lectura (cacheada) que usa la página: no se pide el proyecto dos veces.
  const project = await getSiteProjectBySlug(slug);
  // El código solo es único por piso: se busca dentro del edificio de la URL.
  const found = findSiteUnit(project, buildingId, unitId);
  const t = crearT(locale);
  if (!found) return { title: t('sitio.paginas.unidadNoEncontrada') };
  const { building, unit } = found;

  const title = t('sitio.paginas.unidadTitulo', { nombre: unit.name });
  // Un local / cochera no tiene dormitorios: se describe por su categoría.
  const description = unitIsDwelling(unit)
    ? t('sitio.paginas.unidadDescripcion', { modelo: unit.modelName || etiquetaCatalogo(unit.type, locale), count: unit.bedrooms, area: unit.totalArea })
    : t('sitio.paginas.unidadDescripcionCategoria', { categoria: unitCategoryLabel(unitCategory(unit), locale), area: unit.totalArea });
  const image = unit.interiorImageUrl || unit.galleryImages?.[0] || undefined;

  return {
    // Canónica con el código aunque se haya entrado por el uuid (como la ficha).
    alternates: await alternatesFor(slug, `/edificio/${building.id}/unidad/${encodeURIComponent(unit.id)}`, project?.locales ?? ['es'], locale),
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined, locale: locale === 'en' ? 'en_US' : 'es_AR' },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function UnitPage({ params, searchParams }: PageProps) {
  const { slug, buildingId, unitId } = await params;
  const { tab, volver } = await searchParams;

  const project = await getSiteProjectBySlug(slug);
  const found = findSiteUnit(project, buildingId, unitId);
  if (!project || !found) notFound();
  const { building, unit } = found;

  const initialTab = VALID_TABS.includes(tab as UnitViewTab) ? (tab as UnitViewTab) : undefined;
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, await getLocale());
  const basePath = await getProjectBasePath(slug);

  const slimUnits = project.units.map(u => ({
    ...u,
    polygon: undefined,
    parkingSpots: undefined,
    rooms: u.rooms?.map(r => ({ ...r, polygon: undefined })),
    levels: u.levels?.map(l => ({ ...l, rooms: l.rooms.map(r => ({ ...r, polygon: undefined })) })),
  }));

  return (
    <UnitViewerWrapper
      unit={unit}
      allUnits={slimUnits}
      bimModel={unitBimModel(project.bimModels, unit)}
      projectSlug={slug}
      projectName={project.name}
      buildingId={building.id}
      buildingName={building.name}
      floorNumber={unit.floor}
      floorPlanImage={building.floors.find(f => f.id === unit.floorId)?.planImage || undefined}
      floorView={pickUnitView(building.floors, unit)}
      amenities={project.amenities}
      pointsOfInterest={project.pointsOfInterest}
      projectLocation={project.location}
      projectLatitude={project.latitude}
      projectLongitude={project.longitude}
      initialTab={initialTab}
      typeConfig={typeConfig}
      backHref={volver ? `${basePath}/unidades?${volver}` : undefined}
    />
  );
}
