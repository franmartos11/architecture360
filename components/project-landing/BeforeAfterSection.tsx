import Reveal from '@/components/ui/Reveal';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import type { SectionProps } from './types';

// Antes / Después — reciclaje o rehabilitación.
export default function BeforeAfterSection({ project }: SectionProps) {
  if (project.beforeAfter.length === 0) return null;

  return (
    <section className="py-[var(--theme-spacing)] bg-[var(--theme-bg)]">
      <Reveal className="max-w-6xl mx-auto px-4 md:px-6 mb-12">
        <h2 className="font-[family-name:var(--theme-font-heading)] text-3xl font-light text-[var(--theme-text)] leading-tight">Antes / Después</h2>
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
