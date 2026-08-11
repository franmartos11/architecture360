import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProjectBySlug } from '@/data/project-repository';
import AmenitiesView from '@/components/amenities/AmenitiesView';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: `${project.name} | Amenities`,
    description: `Conocé y recorré en 360° las amenities de ${project.name}.`,
  };
}

export default async function AmenitiesPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  return <AmenitiesView project={project} />;
}
