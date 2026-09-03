import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicProjectBySlug } from '@/data/project-repository';
import AmenitiesView from '@/components/amenities/AmenitiesView';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edificio?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: `${project.name} | Amenities`,
    description: `Conocé y recorré en 360° las amenities de ${project.name}.`,
  };
}

export default async function AmenitiesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edificio } = await searchParams;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  return <AmenitiesView project={project} initialBuildingFilter={edificio} />;
}
