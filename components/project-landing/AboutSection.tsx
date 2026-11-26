import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import type { SectionProps } from './types';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { projectHasContent } from '@/lib/project-content';
import { pluralize } from '@/lib/units';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import { Container, Pill, SectionHeading } from './ui';

// Más que esto en tipografía de 52px es una pared de texto: el primer
// párrafo va grande solo si es corto; si no, va en tamaño de lectura.
const LEAD_MAX_CHARS = 320;

export default function AboutSection({ project, basePath, typeConfig }: SectionProps) {
  if (!project.description) return null;

  // Ficha académica: solo se completa (y solo tiene sentido mostrar) en
  // proyectos showcase — un desarrollo comercial no tiene "cátedra".
  const academicLine = [project.academicInstitution, project.academicCareer, project.academicTutor, project.academicYear]
    .filter(Boolean)
    .join(' · ');

  const [lead, ...rest] = project.description.trim().split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const leadIsShort = lead.length <= LEAD_MAX_CHARS;
  const isHouse = !typeConfig.hasUnitStep;
  const hasFacade = projectHasContent(project).facade;
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const sideImage = project.aerialSlides[1]?.imageUrl || project.masterplanImage;

  if (template === 'comercial') {
    return (
      <section id="next" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <span className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
              Sobre el desarrollo
            </span>
            <p className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(24px,3vw,40px)] leading-[1.15] font-bold tracking-[-0.025em] text-[var(--theme-text)]">
              {lead}
            </p>
            {rest.map((p, i) => (
              <p key={i} className="m-0 text-base leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">{p}</p>
            ))}
            {(hasFacade || project.commonAreasTour) && (
              <div className="flex gap-2.5 flex-wrap pt-2">
                {hasFacade && <Pill href={`${basePath}/masterplan`} arrow>{isHouse ? 'Ver vista frontal' : 'Explorar masterplan'}</Pill>}
                {project.commonAreasTour && <Pill href={`${basePath}/recorrido`} variant="ghost">Tour 360°</Pill>}
              </div>
            )}
          </div>
          <Reveal className="tpl-card p-6 rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] shadow-sm space-y-4">
            <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-text-muted)]">
              Ficha resumen
            </span>
            <dl className="m-0 divide-y divide-[var(--theme-border)] text-sm">
              {project.location && (
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-[var(--theme-text-muted)]">Ubicación</dt>
                  <dd className="m-0 font-semibold text-[var(--theme-text)] text-right">{project.location}</dd>
                </div>
              )}
              {project.units.length > 0 && (
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-[var(--theme-text-muted)]">{pluralize(typeConfig.unitLabel)}</dt>
                  <dd className="m-0 font-semibold text-[var(--theme-text)]">{project.units.length}</dd>
                </div>
              )}
              {project.constructionProgress?.deliveryEstimate && (
                <div className="py-2.5 flex justify-between gap-4">
                  <dt className="text-[var(--theme-text-muted)]">Entrega estimada</dt>
                  <dd className="m-0 font-semibold text-[var(--theme-text)]">{project.constructionProgress.deliveryEstimate}</dd>
                </div>
              )}
            </dl>
          </Reveal>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="next" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-5">
            <p className="m-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-[var(--theme-text-muted)]">
              Memoria & concepto
            </p>
            {academicLine && (
              <p className="m-0 text-sm font-medium text-[var(--theme-accent)]">{academicLine}</p>
            )}
            <p className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(26px,3.2vw,44px)] leading-[1.14] font-medium tracking-[-0.025em] text-[var(--theme-text)]">
              {lead}
            </p>
            {rest.map((p, i) => (
              <p key={i} className="m-0 text-base leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">{p}</p>
            ))}
            {(hasFacade || project.commonAreasTour) && (
              <div className="flex gap-2.5 flex-wrap pt-2">
                {hasFacade && <Pill href={`${basePath}/masterplan`} variant="ghost" arrow>{isHouse ? 'Ver vista frontal' : 'Ver masterplan'}</Pill>}
                {project.commonAreasTour && <Pill href={`${basePath}/recorrido`} variant="ghost">Tour 360°</Pill>}
              </div>
            )}
          </div>
          {sideImage && (
            <Reveal delay={0.1} className="ed-curtain relative aspect-[4/5] w-full overflow-hidden rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)]">
              <Image
                src={sideImage}
                alt={project.name}
                fill
                sizes="(min-width: 1024px) 45vw, 100vw"
                placeholder="blur"
                blurDataURL={shimmerDataUrl()}
                className="object-cover"
              />
            </Reveal>
          )}
        </Container>
      </section>
    );
  }

  return (
    <section id="next" className="pt-[var(--theme-spacing)] pb-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <SectionHeading eyebrow="Sobre el proyecto">
          <div className="flex flex-col gap-10">
            {academicLine && (
              <p className="m-0 -mb-4 text-sm font-medium text-[var(--theme-accent)]">{academicLine}</p>
            )}
            {leadIsShort ? (
              // Cada palabra se "rellena" de color a medida que entra en
              // pantalla (CSS scroll-driven, ver .lp-fill en globals.css).
              <p className="lp-fill m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(28px,3.6vw,52px)] leading-[1.12] font-medium tracking-[-0.025em] text-[var(--theme-text)]">
                {lead.split(/\s+/).map((w, i) => <span key={i} className="w">{w} </span>)}
              </p>
            ) : (
              <p className="m-0 text-xl sm:text-2xl leading-relaxed text-[var(--theme-text)] whitespace-pre-line">{lead}</p>
            )}
            {rest.length > 0 && (
              <Reveal className="max-w-2xl space-y-4">
                {rest.map((p, i) => (
                  <p key={i} className="m-0 text-base leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">{p}</p>
                ))}
              </Reveal>
            )}
            {(hasFacade || project.commonAreasTour) && (
              <div className="flex gap-2.5 flex-wrap">
                {/* Sin fachada cargada /masterplan da 404: no se ofrece. */}
                {hasFacade && <Pill href={`${basePath}/masterplan`} arrow>{isHouse ? 'Ver vista frontal' : 'Ver masterplan'}</Pill>}
                {project.commonAreasTour && <Pill href={`${basePath}/recorrido`} variant="ghost">Tour 360°</Pill>}
              </div>
            )}
          </div>
        </SectionHeading>
      </Container>
    </section>
  );
}
