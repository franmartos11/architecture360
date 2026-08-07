import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import UnitViewerWrapper from '@/components/unit/UnitViewerWrapper';
import { getProjectBySlug, getUnitById } from '@/data/project-repository';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string; unitId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { unitId } = await params;
  const unit = await getUnitById(unitId);
  return {
    title: unit ? `Unidad ${unit.name} | Interior` : 'Unidad no encontrada',
  };
}

export default async function UnitPage({ params }: PageProps) {
  const { slug, buildingId, unitId } = await params;

  const project = await getProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);
  const unit = await getUnitById(unitId);

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
