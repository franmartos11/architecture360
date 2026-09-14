import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getPublicProjectBySlug } from '@/data/project-repository';
import UnitsListView from '@/components/units/UnitsListView';
import { getProjectTypeConfig } from '@/lib/project-types';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getPublicProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  const unitLabelLower = typeConfig.unitLabel.toLowerCase();
  return {
    title: `${project.name} | ${typeConfig.unitLabel}s`,
    description: `Buscá y filtrá todas las ${unitLabelLower}s disponibles de ${project.name}.`,
  };
}

export default async function UnidadesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;
  const project = await getPublicProjectBySlug(slug);
  if (!project) notFound();

  // Los filtros llegan por query string para que un listado filtrado sea una
  // dirección a la que se puede volver desde la ficha de una unidad (y que se
  // puede compartir). La vista los sincroniza de vuelta a la URL — ver
  // UnitsListView.
  const initialQuery = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      typeof v === 'string' ? [[k, v] as [string, string]] : [],
    ),
  ).toString();

  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  return <UnitsListView project={project} initialQuery={initialQuery} typeConfig={typeConfig} />;
}
