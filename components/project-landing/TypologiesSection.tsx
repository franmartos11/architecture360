import Reveal from '@/components/ui/Reveal';
import { TabsSection } from '@/components/TabsSection';
import { pluralize } from '@/lib/units';
import type { SectionProps } from './types';
import { Container, Pill } from './ui';

export default function TypologiesSection({ project, typeConfig, basePath }: SectionProps) {
  if (project.units.length === 0) return null;
  const label = pluralize(typeConfig.unitLabel);

  return (
    <section id="modelos" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)]">
      <Container>
        <Reveal className="flex flex-wrap gap-6 items-end justify-between mb-10">
          <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(38px,5vw,72px)] leading-none font-medium tracking-[-0.04em] text-[var(--theme-text)]">
            Conocé cada espacio <br /><span className="text-[var(--theme-text-muted)]">en detalle</span>
          </h2>
          {typeConfig.hasUnitStep && (
            <Pill href={`${basePath}/unidades`} variant="ghost" arrow>
              {project.units.length === 1 ? `Ver ${typeConfig.unitLabel.toLowerCase()}` : `Ver ${typeConfig.unitLabelGender === 'f' ? 'las' : 'los'} ${project.units.length} ${label.toLowerCase()}`}
            </Pill>
          )}
        </Reveal>
        <Reveal delay={0.1}>
          <TabsSection units={project.units} showPrice={typeConfig.showPrice} unitIsLand={typeConfig.unitIsLand} kindLabel={typeConfig.unitLabel} />
        </Reveal>
      </Container>
    </section>
  );
}
