import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Navbar from '@/components/ui/Navbar';
import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import CommentSection from '@/components/CommentSection';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { getProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveSectionOrder } from '@/lib/project-sections';
import { SECTION_COMPONENTS } from '@/components/project-landing/registry';
import { resolveTheme } from '@/lib/resolve-theme';
import { ALL_FONT_CLASSNAMES } from '@/lib/fonts';
import { formatPrice } from '@/lib/units';
import { getProjectBasePath } from '@/lib/project-base-path';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: project.name,
    description: project.description,
  };
}

export default async function ProjectLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project) notFound();

  const basePath = await getProjectBasePath(slug);
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  const sectionOrder = resolveSectionOrder(project.sectionConfig, typeConfig);
  const theme = resolveTheme(project.themeConfig);

  // Postura del hero: venta apunta a conversión (precio desde + CTA a
  // disponibilidad), showcase apunta a credencial académica en vez de
  // ubicación comercial — mismo hero, dos lecturas de los mismos datos.
  const cheapestAvailable = typeConfig.showPrice
    ? project.units
        .filter(u => u.status === 'available' && typeof u.price === 'number' && u.price > 0)
        .reduce<typeof project.units[number] | null>((min, u) => (!min || u.price! < min.price!) ? u : min, null)
    : null;
  const academicLine = [project.academicInstitution, project.academicYear].filter(Boolean).join(' · ');
  const heroMetaLine = typeConfig.saleMode === 'showcase'
    ? (academicLine || project.location)
    : [project.location, cheapestAvailable ? `Desde ${formatPrice(cheapestAvailable.price!, cheapestAvailable.currency)}` : null]
        .filter(Boolean)
        .join(' · ');

  return (
    <div
      className={`${ALL_FONT_CLASSNAMES} theme-bg-image theme-bg-image--fixed bg-[var(--theme-bg)] min-h-screen`}
      style={{ ...theme.cssVars, fontFamily: 'var(--theme-font-body)' } as React.CSSProperties}
    >
      {theme.fontFaceCss && <style dangerouslySetInnerHTML={{ __html: theme.fontFaceCss }} />}
      <Navbar
        showCalculator={typeConfig.showCalculator}
        hasTour={!!project.commonAreasTour}
        singleUnit={!typeConfig.hasUnitStep && project.units[0]
          ? { buildingId: project.units[0].buildingId, unitId: project.units[0].id, label: typeConfig.unitLabel }
          : undefined}
      />

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src={project.masterplanImage || 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80'}
            alt={project.name}
            fill
            sizes="100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl(1920, 1080)}
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-black/40" />
        </div>

        <div className="relative z-10 text-center px-4 sm:px-6 mt-16 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-thin tracking-wide text-white animate-fade-in-up">
            {project.name}
          </h1>
          {project.tagline && (
            <p className="mt-4 text-white/90 text-xl sm:text-2xl font-light">{project.tagline}</p>
          )}
          {heroMetaLine && (
            <p className={`text-white/80 text-lg font-light tracking-wide ${project.tagline ? 'mt-2' : 'mt-4'}`}>{heroMetaLine}</p>
          )}
          {typeConfig.saleMode === 'venta' && project.units.length > 0 && (
            <a
              href={`${basePath}/unidades`}
              className="mt-8 inline-block px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm"
            >
              VER DISPONIBILIDAD
            </a>
          )}
        </div>

        <a href="#next" className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <div className="w-10 h-10 rounded-full border border-white/50 flex items-center justify-center text-white backdrop-blur-sm">
            &darr;
          </div>
        </a>
      </section>

      {sectionOrder.map(key => {
        const Section = SECTION_COMPONENTS[key];
        return <Section key={key} project={project} typeConfig={typeConfig} basePath={basePath} />;
      })}

      {/* Comentarios */}
      <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
        <Reveal className="max-w-3xl mx-auto px-4 md:px-6 mb-10">
          <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">Comentarios</h2>
        </Reveal>
        <div className="px-4 md:px-6">
          <CommentSection entityType="project" entityId={project.id} />
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--theme-bg-alt)] text-[var(--theme-text-on-dark)] py-12 border-t border-[var(--theme-border-on-dark)]">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="font-[family-name:var(--theme-font-heading)] text-2xl font-bold tracking-widest">{project.name.toUpperCase()}</div>
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-light text-[var(--theme-text-on-dark-muted)]">
            <a href={basePath || '/'} className="hover:text-[var(--theme-text-on-dark)] transition-colors">Inicio</a>
            {project.description && <a href="#next" className="hover:text-[var(--theme-text-on-dark)] transition-colors">Sobre el proyecto</a>}
            {project.units.length > 0 && <a href="#modelos" className="hover:text-[var(--theme-text-on-dark)] transition-colors">{typeConfig.unitLabel}s</a>}
            {typeConfig.showCalculator && <a href="#cotizador" className="hover:text-[var(--theme-text-on-dark)] transition-colors">Cotizador</a>}
          </div>
        </div>
      </footer>
    </div>
  );
}
