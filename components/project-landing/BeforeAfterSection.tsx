import Reveal from '@/components/ui/Reveal';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import type { SectionProps } from './types';
import { SectionHeading } from './ui';

// Antes / Después — reciclaje o rehabilitación.
export default function BeforeAfterSection({ project }: SectionProps) {
  if (project.beforeAfter.length === 0) return null;

  return (
    <section className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-[1360px] mx-auto px-4 sm:px-6 mb-12">
        <SectionHeading eyebrow="Antes / Después" title="Lo que había," muted="y lo que es." />
      </Reveal>
      <div className="max-w-4xl mx-auto px-4 md:px-6 space-y-12">
        {project.beforeAfter.map((pair, i) => (
          <Reveal key={i} delay={i * 0.1}>
            <BeforeAfterSlider {...pair} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
