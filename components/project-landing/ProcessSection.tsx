import Reveal from '@/components/ui/Reveal';
import ProcessGallery from '@/components/ProcessGallery';
import type { SectionProps } from './types';
import { SectionHeading } from './ui';

// Galería de proceso — bocetos, maquetas, diagramas.
export default function ProcessSection({ project }: SectionProps) {
  if (project.processGallery.length === 0) return null;

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-[1360px] mx-auto px-4 sm:px-6 mb-12">
        <SectionHeading eyebrow="Proceso" title="Bocetos, maquetas y diagramas" muted="detrás del proyecto." />
      </Reveal>
      <Reveal delay={0.1} className="max-w-6xl mx-auto px-4 md:px-6">
        <ProcessGallery images={project.processGallery} />
      </Reveal>
    </section>
  );
}
