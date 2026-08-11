import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getProjectBySlug } from '@/data/project-repository';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: `${project.name} | Recorrido de espacios comunes`,
    description: `Recorré en 360° los pasillos, la pileta y las áreas comunes de ${project.name}.`,
  };
}

export default async function RecorridoPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { focus, embed } = await searchParams;
  const isEmbed = embed === 'true';
  const project = await getProjectBySlug(slug);
  if (!project || !project.commonAreasTour) notFound();

  return (
    <CommonAreasTourWrapper
      projectName={project.name}
      projectSlug={slug}
      tourData={project.commonAreasTour}
      focusNodeId={focus}
      embed={isEmbed}
    />
  );
}
