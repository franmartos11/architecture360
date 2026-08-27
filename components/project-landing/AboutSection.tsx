import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { SectionProps } from './types';

export default function AboutSection({ project, basePath }: SectionProps) {
  if (!project.description) return null;

  // Ficha académica: solo se completa (y solo tiene sentido mostrar) en
  // proyectos showcase — un desarrollo comercial no tiene "cátedra".
  const academicLine = [project.academicInstitution, project.academicCareer, project.academicTutor, project.academicYear]
    .filter(Boolean)
    .join(' · ');

  return (
    <section id="next" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12 items-center">
          <Reveal className="space-y-6">
            <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">
              Sobre el proyecto
            </h2>
            {academicLine && (
              <p className="text-sm text-[var(--theme-accent)] tracking-wide -mt-4">{academicLine}</p>
            )}
            <p className="text-[var(--theme-text-muted)] font-light leading-relaxed whitespace-pre-line">{project.description}</p>
            {project.academicTeam && (
              <p className="text-sm text-[var(--theme-text-muted)]">Integrantes: {project.academicTeam}</p>
            )}
            <div className="pt-4 flex flex-wrap gap-4">
              <a
                href={`${basePath}/masterplan`}
                className="px-6 py-3 border border-[var(--theme-text)] text-[var(--theme-text)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)] transition-colors duration-300 tracking-wider text-sm"
              >
                VER MASTERPLAN
              </a>
              <a
                href="#tour-360"
                className="px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm"
              >
                TOUR 360°
              </a>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="relative h-[320px] sm:h-[420px] md:h-[600px] w-full rounded-[var(--theme-radius)] overflow-hidden">
            <Image
              src={project.masterplanImage || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'}
              alt={project.name}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
