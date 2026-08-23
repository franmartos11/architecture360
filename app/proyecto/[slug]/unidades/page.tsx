import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getProjectBySlug } from '@/data/project-repository';
import UnitsListView from '@/components/units/UnitsListView';
import { getProjectTypeConfig } from '@/lib/project-types';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ edificio?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: `${project.name} | Unidades`,
    description: `Buscá y filtrá todas las unidades disponibles de ${project.name}.`,
  };
}

export default async function UnidadesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { edificio } = await searchParams;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <UnitsListView project={project} initialBuildingFilter={edificio} typeConfig={typeConfig} />;
}
