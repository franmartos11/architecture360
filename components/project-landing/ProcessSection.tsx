import Reveal from '@/components/ui/Reveal';
import ProcessGallery from '@/components/ProcessGallery';
import type { SectionProps } from './types';

// Galería de proceso — bocetos, maquetas, diagramas.
export default function ProcessSection({ project }: SectionProps) {
  if (project.processGallery.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-6xl mx-auto px-4 md:px-6 mb-12">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">Proceso</h2>
        <p className="text-[var(--theme-text-muted)] font-light mt-2">Bocetos, maquetas y diagramas detrás del proyecto.</p>
      </Reveal>
      <Reveal delay={0.1} className="max-w-6xl mx-auto px-4 md:px-6">
        <ProcessGallery images={project.processGallery} />
      </Reveal>
    </section>
  );
}
