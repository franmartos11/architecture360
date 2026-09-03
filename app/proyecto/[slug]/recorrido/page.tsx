import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getPublicProjectBySlug } from '@/data/project-repository';
import { getSunAzimuths } from '@/lib/sun-position';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string; embed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
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
  const project = await getPublicProjectBySlug(slug);
  if (!project || !project.commonAreasTour) notFound();

  const sunAzimuths = project.latitude != null ? getSunAzimuths(project.latitude) : null;

  return (
    <CommonAreasTourWrapper
      projectName={project.name}
      projectSlug={slug}
      tourData={project.commonAreasTour}
      focusNodeId={focus}
      embed={isEmbed}
      orientationDegrees={project.tourOrientationDegrees}
      sunAzimuths={sunAzimuths}
    />
  );
}
