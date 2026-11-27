import { alternatesFor } from '@/lib/i18n/alternates';
import { getLocale, getT } from '@/lib/i18n/server';
import type { T } from '@/lib/i18n/t';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Project } from '@/types';
import ProjectHero from '@/components/project-landing/ProjectHero';
import { Container } from '@/components/project-landing/ui';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveSectionOrder } from '@/lib/project-sections';
import { SECTION_COMPONENTS } from '@/components/project-landing/registry';
import { formatPrice, pluralize } from '@/lib/units';
import { getProjectBasePath } from '@/lib/project-base-path';
import { progressHeadline, showsConstructionProgress } from '@/lib/construction-progress-view';
import { projectHasContent } from '@/lib/project-content';
import { resolveWebTemplateKey } from '@/lib/web-templates';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const project = await getSiteProjectBySlug(slug);
  const t = await getT();
  if (!project) return { title: t('sitio.paginas.proyectoNoEncontrado') };
  return {
    alternates: await alternatesFor(slug, '', project.locales, locale),
    title: project.name,
    // La descripción es opcional y muchos proyectos no la cargan; sin
    // fallback la página sale sin meta description y los buscadores se
    // inventan el resumen. Con los datos que siempre hay (nombre, bajada,
    // ubicación) alcanza para una línea decente.
    description: projectDescription(project, t),
  };
}

function projectDescription(project: Project, t: T): string {
  if (project.description?.trim()) return project.description;

  const contexto = [project.tagline, project.location].filter(Boolean).join(' · ');
  return contexto
    ? t('sitio.paginas.descripcionConContexto', { nombre: project.name, contexto })
    : t('sitio.paginas.descripcion', { nombre: project.name });
}

export default async function ProjectLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) notFound();

  const basePath = await getProjectBasePath(slug);
  const locale = await getLocale();
  const t = await getT();
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode, locale);
  const sectionOrder = resolveSectionOrder(project.sectionConfig, typeConfig);
  const content = projectHasContent(project);

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
    : [
        project.location,
        project.units.length > 1 ? `${project.units.length} ${pluralize(typeConfig.unitLabel, locale).toLowerCase()}` : null,
        cheapestAvailable ? t('sitio.tipologias.desdePrecio', { precio: formatPrice(cheapestAvailable.price!, cheapestAvailable.currency, locale) }) : null]
        .filter(Boolean)
        .join(' · ');

  // Avance de obra en el hero: solo si la sección está en la landing (el
  // admin la prende) y tiene algo — si no, el enlace no lleva a nada.
  const progressText = showsConstructionProgress(project.constructionProgress, sectionOrder)
    ? progressHeadline(project.constructionProgress, locale)
    : null;

  const heroImage = project.masterplanImage
    || project.aerialSlides[0]?.imageUrl
    || 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80';

  const webTemplate = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const availableCount = project.units.filter(u => u.status === 'available').length;
  const heroBadge = typeConfig.saleMode === 'showcase'
    ? (academicLine || undefined)
    : availableCount > 0
      ? t('sitio.portada.disponibles', { count: availableCount, unidad: typeConfig.unitLabel.toLowerCase(), unidades: pluralize(typeConfig.unitLabel, locale).toLowerCase() })
      : undefined;

  return (
    // -mt-16 anula el pt-16 que el layout aplica para despejar el Navbar
    // fixed: acá el hero es a pantalla completa y tiene que pasar POR DEBAJO
    // del nav, que es translúcido a propósito.
    <div className="-mt-16 text-[var(--theme-text)]">
      <ProjectHero
        variant={webTemplate}
        badge={heroBadge}
        name={project.name}
        image={heroImage}
        tagline={project.tagline || (typeConfig.saleMode === 'venta' ? t('sitio.portada.taglinePorDefecto') : undefined)}
        meta={heroMetaLine || undefined}
        // Sin fachada cargada no hay botón a /masterplan (daría 404).
        primary={typeConfig.saleMode === 'venta' && content.units
          ? { href: `${basePath}/unidades`, label: t('sitio.portada.verDisponibilidad') }
          : content.facade
            ? { href: `${basePath}/masterplan`, label: typeConfig.hasUnitStep ? t('sitio.about.verMasterplan') : t('sitio.about.verVistaFrontal') }
            : undefined}
        secondary={content.tour ? { href: `${basePath}/recorrido`, label: t('sitio.about.tour360') } : undefined}
        progress={progressText ? { href: '#avance', text: progressText } : undefined}
        briefUrl={project.briefPdfUrl}
      />

      {sectionOrder.map(key => {
        const Section = SECTION_COMPONENTS[key];
        return <Section key={key} project={project} typeConfig={typeConfig} basePath={basePath} locale={locale} />;
      })}

      {/* Footer */}
      <footer className="bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container className="py-14 pb-10 flex flex-wrap gap-8 justify-between text-sm text-[var(--theme-text-muted)]">
          <div className="flex flex-col gap-1">
            <span className="font-[family-name:var(--theme-font-heading)] text-[22px] font-bold tracking-[-0.02em] text-[var(--theme-text)]">{project.name}</span>
            {project.location && <span>{project.location}</span>}
          </div>
          <nav aria-label={t('sitio.portada.pie')} className="flex gap-x-6 gap-y-2 flex-wrap font-medium">
            <a href={basePath || '/'} className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.portada.inicio')}</a>
            {project.description && <a href="#next" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.about.sobreElProyecto')}</a>}
            {project.units.length > 0 && <a href="#modelos" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{pluralize(typeConfig.unitLabel, locale)}</a>}
            {project.amenities.some(a => a.images.length > 0) && <a href="#amenities" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('nav.amenities')}</a>}
            {(project.themeConfig?.qualitiesItems?.length ?? 0) > 0 && sectionOrder.includes('qualities') && (
              <a href="#calidades" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.portada.calidades')}</a>
            )}
            {(project.themeConfig?.faqItems?.length ?? 0) > 0 && sectionOrder.includes('faq') && (
              <a href="#faq" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.portada.faq')}</a>
            )}
            {progressText && <a href="#avance" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.avance.eyebrow')}</a>}
            {typeConfig.showCalculator && <a href="#cotizador" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.portada.cotizador')}</a>}
            {typeConfig.showLeads && <a href="#contacto" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{t('sitio.contacto.contacto')}</a>}
          </nav>
        </Container>
      </footer>
    </div>
  );
}
