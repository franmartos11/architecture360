import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import FloorPlanWrapper from '@/components/floorplan/FloorPlanWrapper';
import { getProjectBySlug, getBuildingById } from '@/data/mockData';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ piso?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, buildingId } = await params;
  const building = getBuildingById(slug, buildingId);
  return {
    title: building ? `${building.name} | Plano de Pisos` : 'Edificio no encontrado',
  };
}

export default async function BuildingPage({ params, searchParams }: PageProps) {
  const { slug, buildingId } = await params;
  const { piso } = await searchParams;

  const project = getProjectBySlug(slug);
  const building = getBuildingById(slug, buildingId);

  if (!project || !building) notFound();

  const initialFloor = piso ? parseInt(piso, 10) : 1;

  return (
    <FloorPlanWrapper
      building={building}
      projectSlug={slug}
      initialFloor={initialFloor}
    />
  );
}
