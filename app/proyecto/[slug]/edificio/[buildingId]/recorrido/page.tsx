import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getBuildingById } from '@/data/project-repository';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, buildingId } = await params;
  const building = await getBuildingById(slug, buildingId);
  if (!building) return { title: 'Torre no encontrada' };
  return {
    title: `${building.name} | Amenities en 360°`,
    description: `Recorré en 360° las amenities exclusivas de ${building.name}.`,
  };
}

export default async function BuildingTourPage({ params, searchParams }: PageProps) {
  const { slug, buildingId } = await params;
  const { focus, embed } = await searchParams;
  const isEmbed = embed === 'true';
  const building = await getBuildingById(slug, buildingId);
  if (!building || !building.amenitiesTour) notFound();

  return (
    <CommonAreasTourWrapper
      projectName={building.name}
      projectSlug={slug}
      tourData={building.amenitiesTour}
      focusNodeId={focus}
      label={`Recorrido — ${building.name}`}
      backHref={`/proyecto/${slug}/edificio/${buildingId}`}
      backLabel={`Volver a ${building.name}`}
      embed={isEmbed}
    />
  );
}
