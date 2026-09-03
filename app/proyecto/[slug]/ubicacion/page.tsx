import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicProjectBySlug } from '@/data/project-repository';
import LocationView from '@/components/location/LocationView';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: `${project.name} | Ubicación`,
    description: `Ubicación y puntos de interés cercanos a ${project.name}.`,
  };
}

export default async function UbicacionPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  return <LocationView project={project} />;
}
