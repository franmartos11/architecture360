import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import UnitViewerWrapper from '@/components/unit/UnitViewerWrapper';
import { getProjectBySlug, getBuildingById, getUnitById } from '@/data/mockData';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string; unitId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { unitId } = await params;
  const unit = getUnitById(unitId);
  return {
    title: unit ? `Unidad ${unit.name} | Interior` : 'Unidad no encontrada',
  };
}

export default async function UnitPage({ params }: PageProps) {
  const { slug, buildingId, unitId } = await params;

  const project = getProjectBySlug(slug);
  const building = getBuildingById(slug, buildingId);
  const unit = getUnitById(unitId);

  if (!project || !building || !unit) notFound();

  return (
    <UnitViewerWrapper
      unit={unit}
      projectSlug={slug}
      buildingId={building.id}
      floorNumber={unit.floor}
    />
  );
}
