import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import UnitViewerWrapper from '@/components/unit/UnitViewerWrapper';
import { getProjectBySlug, getUnitById } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import type { UnitViewTab } from '@/types';

const VALID_TABS: UnitViewTab[] = ['planta3d', 'tour360', 'plano', 'galeria', 'amenities', 'ubicacion'];

interface PageProps {
  params: Promise<{ slug: string; buildingId: string; unitId: string }>;
  searchParams: Promise<{ tab?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, unitId } = await params;
  const unit = await getUnitById(slug, unitId);
  if (!unit) return { title: 'Unidad no encontrada' };

  const title = `Unidad ${unit.name} | Interior`;
  const description = `${unit.modelName || unit.type} · ${unit.bedrooms} dormitorio${unit.bedrooms === 1 ? '' : 's'} · ${unit.totalArea}m² — recorré el interior en 3D y 360°.`;
  const image = unit.interiorImageUrl || unit.galleryImages?.[0] || undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function UnitPage({ params, searchParams }: PageProps) {
  const { slug, buildingId, unitId } = await params;
  const { tab } = await searchParams;

  const project = await getProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);
  const unit = await getUnitById(slug, unitId);

  if (!project || !building || !unit) notFound();

  const initialTab = VALID_TABS.includes(tab as UnitViewTab) ? (tab as UnitViewTab) : undefined;
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);

  return (
    <UnitViewerWrapper
      unit={unit}
      allUnits={project.units}
      projectSlug={slug}
      projectName={project.name}
      buildingId={building.id}
      floorNumber={unit.floor}
      amenities={project.amenities}
      pointsOfInterest={project.pointsOfInterest}
      projectLocation={project.location}
      projectLatitude={project.latitude}
      projectLongitude={project.longitude}
      initialTab={initialTab}
      typeConfig={typeConfig}
    />
  );
}
