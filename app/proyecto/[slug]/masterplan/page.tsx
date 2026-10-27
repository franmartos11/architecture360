import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AerialViewWrapper from '@/components/aerial/AerialViewWrapper';
import { getPublicProjectBySlug } from '@/data/project-repository';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  // "Fachada": el mismo nombre que le dan la barra, el menú y las migas.
  return {
    title: `${project.name} | Fachada`,
    description: project.description,
  };
}

export default async function ProjectMasterplanPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  return <AerialViewWrapper project={project} />;
}
