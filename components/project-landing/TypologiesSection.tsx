import Reveal from '@/components/ui/Reveal';
import { TabsSection } from '@/components/TabsSection';
import type { SectionProps } from './types';

export default function TypologiesSection({ project, typeConfig }: SectionProps) {
  if (project.units.length === 0) return null;

  return (
    <section id="modelos" className="py-[var(--theme-spacing)] bg-[var(--theme-bg-accent)]">
      <div className="max-w-6xl mx-auto px-6">
        <Reveal className="mb-16 space-y-4">
          <div className="text-[var(--theme-text-on-dark-muted)] tracking-widest text-sm font-semibold">{typeConfig.unitLabel.toUpperCase()}S DISPONIBLES</div>
          <h2 className="font-[family-name:var(--theme-font-heading)] text-4xl md:text-5xl font-light text-[var(--theme-text-on-dark)] leading-tight max-w-3xl">
            CONOCÉ CADA ESPACIO EN DETALLE
          </h2>
        </Reveal>

        <Reveal delay={0.15} className="bg-[var(--theme-bg)] rounded-[var(--theme-radius)] p-8 md:p-12">
          <TabsSection units={project.units} showPrice={typeConfig.showPrice} />
        </Reveal>
      </div>
    </section>
  );
}
