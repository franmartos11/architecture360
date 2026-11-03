import Reveal from '@/components/ui/Reveal';
import type { SectionProps } from './types';
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
            <div className="flex gap-2.5 flex-wrap">
              <Pill href={`${basePath}/masterplan`} arrow>{isHouse ? 'Ver vista frontal' : 'Ver masterplan'}</Pill>
              {project.commonAreasTour && <Pill href={`${basePath}/recorrido`} variant="ghost">Tour 360°</Pill>}
            </div>
          </div>
        </SectionHeading>
      </Container>
    </section>
  );
}
