import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getBuildingById, getProjectBySlug } from '@/data/project-repository';
import { getSunAzimuths } from '@/lib/sun-position';
import { getProjectBasePath } from '@/lib/project-base-path';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ focus?: string; embed?: string }>;
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

  // La ubicación (lat/lng) es del proyecto, no de la torre — getProjectBySlug
  // está cacheado por request, así que esto no repite el fetch que ya hizo
  // getBuildingById por dentro.
  const project = await getProjectBySlug(slug);
  const sunAzimuths = project?.latitude != null ? getSunAzimuths(project.latitude) : null;
  const basePath = await getProjectBasePath(slug);

  return (
    <CommonAreasTourWrapper
      projectName={building.name}
      projectSlug={slug}
      tourData={building.amenitiesTour}
      focusNodeId={focus}
      label={`Recorrido — ${building.name}`}
      backHref={`${basePath}/edificio/${buildingId}`}
      backLabel={`Volver a ${building.name}`}
      embed={isEmbed}
      orientationDegrees={building.tourOrientationDegrees}
      sunAzimuths={sunAzimuths}
    />
  );
}
