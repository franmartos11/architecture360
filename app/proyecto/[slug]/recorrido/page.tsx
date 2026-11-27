import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import CommonAreasTourWrapper from '@/components/tour/CommonAreasTourWrapper';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getSunAzimuths } from '@/lib/sun-position';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ focus?: string; embed?: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  const t = await getT();
  if (!project) return { title: t('sitio.paginas.proyectoNoEncontrado') };
  return {
    alternates: await alternatesFor(slug, '/recorrido', project.locales, locale),
    title: t('sitio.paginas.titulo', { nombre: project.name, seccion: t('sitio.paginas.recorridoTitulo') }),
    description: t('sitio.paginas.recorridoDescripcion', { nombre: project.name }),
  };
}

export default async function RecorridoPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const { focus, embed } = await searchParams;
  const isEmbed = embed === 'true';
  const project = await getSiteProjectBySlug(slug);
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
