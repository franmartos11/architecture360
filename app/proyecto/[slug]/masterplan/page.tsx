import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import AerialViewWrapper from '@/components/aerial/AerialViewWrapper';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  const { aerialLabel } = getProjectTypeConfig(project.projectType, project.saleMode);
  return {
    title: `${project.name} | ${aerialLabel}`,
    description: project.description,
  };
}

export default async function ProjectMasterplanPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  return <AerialViewWrapper project={project} />;
}
