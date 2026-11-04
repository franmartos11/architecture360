import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { Project } from '@/types';
import Reveal from '@/components/ui/Reveal';
import CommentSection from '@/components/CommentSection';
import ProjectHero from '@/components/project-landing/ProjectHero';
import { Container, SectionHeading } from '@/components/project-landing/ui';
import { getSiteProjectBySlug } from '@/data/project-repository';
import { getProjectTypeConfig } from '@/lib/project-types';
import { resolveSectionOrder } from '@/lib/project-sections';
import { SECTION_COMPONENTS } from '@/components/project-landing/registry';
import { formatPrice, pluralize } from '@/lib/units';
import { getProjectBasePath } from '@/lib/project-base-path';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) return { title: 'Proyecto no encontrado' };
  return {
    title: project.name,
    // La descripción es opcional y muchos proyectos no la cargan; sin
    // fallback la página sale sin meta description y los buscadores se
    // inventan el resumen. Con los datos que siempre hay (nombre, bajada,
    // ubicación) alcanza para una línea decente.
    description: projectDescription(project),
  };
}

function projectDescription(project: Project): string {
  if (project.description?.trim()) return project.description;

  const contexto = [project.tagline, project.location].filter(Boolean).join(' · ');
  return contexto
    ? `${project.name} — ${contexto}. Conocé el proyecto: unidades, espacios comunes y ubicación.`
    : `${project.name}. Conocé el proyecto: unidades, espacios comunes y ubicación.`;
}

export default async function ProjectLandingPage({ params }: PageProps) {
  const { slug } = await params;
  const project = await getSiteProjectBySlug(slug);
  if (!project) notFound();

  const basePath = await getProjectBasePath(slug);
  const typeConfig = getProjectTypeConfig(project.projectType, project.saleMode);
  const sectionOrder = resolveSectionOrder(project.sectionConfig, typeConfig);

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
        project.units.length > 1 ? `${project.units.length} ${pluralize(typeConfig.unitLabel).toLowerCase()}` : null,
        cheapestAvailable ? `Desde ${formatPrice(cheapestAvailable.price!, cheapestAvailable.currency)}` : null]
        .filter(Boolean)
        .join(' · ');

  const heroImage = project.masterplanImage
    || project.aerialSlides[0]?.imageUrl
    || 'https://images.unsplash.com/photo-1497366216548-37526070297c?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80';

  return (
    // -mt-16 anula el pt-16 que el layout aplica para despejar el Navbar
    // fixed: acá el hero es a pantalla completa y tiene que pasar POR DEBAJO
    // del nav, que es translúcido a propósito.
    <div className="-mt-16 text-[var(--theme-text)]">
      <ProjectHero
        name={project.name}
        image={heroImage}
        tagline={project.tagline || (typeConfig.saleMode === 'venta' ? 'Encontrá tu lugar' : undefined)}
        meta={heroMetaLine || undefined}
        primary={typeConfig.saleMode === 'venta' && project.units.length > 0
          ? { href: `${basePath}/unidades`, label: 'Ver disponibilidad' }
          : { href: `${basePath}/masterplan`, label: typeConfig.hasUnitStep ? 'Ver masterplan' : 'Ver vista frontal' }}
        secondary={project.commonAreasTour ? { href: `${basePath}/recorrido`, label: 'Tour 360°' } : undefined}
      />

      {sectionOrder.map(key => {
        const Section = SECTION_COMPONENTS[key];
        return <Section key={key} project={project} typeConfig={typeConfig} basePath={basePath} />;
      })}

      {/* Comentarios */}
      <section id="comentarios" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
        <Container>
          <Reveal>
            <SectionHeading eyebrow="Comentarios" title="Contanos qué te pareció" muted="el proyecto." className="mb-10" />
          </Reveal>
          <div className="max-w-3xl">
            <CommentSection entityType="project" entityId={project.id} />
          </div>
        </Container>
      </section>

      {/* Footer */}
      <footer className="bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container className="py-14 pb-10 flex flex-wrap gap-8 justify-between text-sm text-[var(--theme-text-muted)]">
          <div className="flex flex-col gap-1">
            <span className="font-[family-name:var(--theme-font-heading)] text-[22px] font-bold tracking-[-0.02em] text-[var(--theme-text)]">{project.name}</span>
            {project.location && <span>{project.location}</span>}
          </div>
          <nav aria-label="Pie de página" className="flex gap-x-6 gap-y-2 flex-wrap font-medium">
            <a href={basePath || '/'} className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">Inicio</a>
            {project.description && <a href="#next" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">Sobre el proyecto</a>}
            {project.units.length > 0 && <a href="#modelos" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">{pluralize(typeConfig.unitLabel)}</a>}
            {project.amenities.some(a => a.images.length > 0) && <a href="#amenities" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">Amenities</a>}
            {typeConfig.showCalculator && <a href="#cotizador" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">Cotizador</a>}
            {typeConfig.showLeads && <a href="#contacto" className="text-[var(--theme-text)] no-underline hover:text-[var(--theme-accent)] transition-colors">Contacto</a>}
          </nav>
        </Container>
      </footer>
    </div>
  );
}
