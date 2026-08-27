import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import type { SectionProps } from './types';

// CTA al masterplan interactivo — a diferencia del resto, no depende de
// ningún contenido cargado (masterplanImage ya tiene fallback), así que
// siempre tiene algo para mostrar; solo se apaga si el admin la deshabilita.
export default function MasterplanCtaSection({ project, basePath }: SectionProps) {
  return (
    <section id="tour-360" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-6xl mx-auto px-6 text-center space-y-4 mb-12">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] tracking-widest">MASTERPLAN INTERACTIVO</h2>
        <p className="text-[var(--theme-text-muted)] font-light">Explora el proyecto desde cualquier ángulo con nuestro visor interactivo.</p>
      </Reveal>

      <Reveal delay={0.15} className="max-w-4xl mx-auto px-6 text-center">
        <div className="relative w-full aspect-[4/3] sm:aspect-[21/9] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-bg-alt)] group mb-8 shadow-2xl">
          <Image
            src={project.masterplanImage || 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'}
            alt={`Vista previa del masterplan de ${project.name}`}
            fill
            sizes="(min-width: 896px) 896px, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover opacity-60 group-hover:opacity-40 transition-opacity duration-500"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6">
            <h3 className="font-[family-name:var(--theme-font-heading)] text-[var(--theme-text-on-dark)] text-2xl sm:text-3xl font-light tracking-widest mb-6 text-center">{project.name.toUpperCase()}</h3>
            <a
              href={`${basePath}/masterplan`}
              className="px-6 py-3 border border-[var(--theme-text-on-dark)] bg-[var(--theme-text-on-dark)]/10 backdrop-blur-md text-[var(--theme-text-on-dark)] hover:bg-[var(--theme-text-on-dark)] hover:text-[var(--theme-bg-alt)] transition-colors duration-300 tracking-wider text-sm"
            >
              ENTRAR AL MASTERPLAN
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
