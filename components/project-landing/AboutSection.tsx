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

  // Cada botón solo si su destino tiene contenido: sin vistas aéreas el
  // masterplan es una pantalla en blanco. "Tour 360°" antes apuntaba al
  // bloque del masterplan de esta misma página (#tour-360); ahora lleva al
  // recorrido real, si hay uno cargado.
  const hasMasterplan = project.aerialSlides.length > 0;
  const hasTour = (project.commonAreasTour?.nodes?.length ?? 0) > 0;
  // Sin foto propia no se muestra una de stock (antes: una casa de
  // Unsplash que no tenía nada que ver con el proyecto) — el texto ocupa
  // todo el ancho.
  const image = project.masterplanImage;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <div className="max-w-7xl mx-auto px-4 md:px-6">
        <div className={`grid grid-cols-1 gap-8 md:gap-12 items-center ${image ? 'md:grid-cols-2' : 'max-w-3xl'}`}>
          <Reveal className="space-y-6">
            <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">
              Sobre el proyecto
            </h2>
            {academicLine && (
              <p className="text-sm text-[var(--theme-accent)] tracking-wide -mt-4">{academicLine}</p>
            )}
            <p className="text-[var(--theme-text-muted)] font-light leading-relaxed whitespace-pre-line">{project.description}</p>
            {/* Los integrantes se muestran en la sección "Equipo" (colaboradores
                confirmados), no como texto libre acá. */}
            {(hasMasterplan || hasTour) && (
              <div className="pt-4 flex flex-wrap gap-4">
                {hasMasterplan && (
                  <a
                    href={`${basePath}/masterplan`}
                    className="px-6 py-3 border border-[var(--theme-text)] text-[var(--theme-text)] hover:bg-[var(--theme-text)] hover:text-[var(--theme-bg)] transition-colors duration-300 tracking-wider text-sm"
                  >
                    VER MASTERPLAN
                  </a>
                )}
                {hasTour && (
                  <a
                    href={`${basePath}/recorrido`}
                    className="px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm"
                  >
                    TOUR 360°
                  </a>
                )}
              </div>
            )}
          </Reveal>

          {image && <Reveal delay={0.15} className="relative h-[320px] sm:h-[420px] md:h-[600px] w-full rounded-[var(--theme-radius)] overflow-hidden">
            <Image
              src={image}
              alt={project.name}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover"
            />
          </Reveal>}
        </div>
      </div>
    </section>
  );
}
