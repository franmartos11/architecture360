import { notFound, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import FloorPlanWrapper from '@/components/floorplan/FloorPlanWrapper';
import { getProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { getProjectBasePath } from '@/lib/project-url';

interface PageProps {
  params: Promise<{ slug: string; buildingId: string }>;
  searchParams: Promise<{ piso?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug, buildingId } = await params;
  const project = await getProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);
  if (!building || !project) return { title: 'Edificio no encontrado' };

  const title = `${building.name} | Plano de Pisos`;
  const description = `Explorá el plano de pisos de ${building.name} en ${project.name}, con disponibilidad de unidades en tiempo real.`;
  const image = project.masterplanImage || undefined;

  return {
    title,
    description,
    openGraph: { title, description, images: image ? [image] : undefined },
    twitter: { card: 'summary_large_image', title, description, images: image ? [image] : undefined },
  };
}

export default async function BuildingPage({ params, searchParams }: PageProps) {
  const { slug, buildingId } = await params;
  const { piso } = await searchParams;

  const project = await getProjectBySlug(slug);
  const building = project?.buildings.find(b => b.id === buildingId);

  if (!project || !building) notFound();

  const initialFloor = piso ? parseInt(piso, 10) : 1;
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);

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
      projectName={project.name}
      amenities={project.amenities}
      pointsOfInterest={project.pointsOfInterest}
      initialFloor={initialFloor}
      typeConfig={typeConfig}
    />
  );
}
