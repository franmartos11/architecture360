import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TabsSection } from '@/components/TabsSection';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, pluralize, unitIsDwelling, unitCategory, UNIT_CATEGORY_LABEL } from '@/lib/units';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { Unit } from '@/types';
import type { SectionProps } from './types';
import { ArrowIcon, Container, Pill } from './ui';

interface GroupedTypology {
  id: string;
  label: string;
  count: number;
  availableCount: number;
  minArea: number;
  minPrice: number | null;
  currency?: string;
  image: string | null;
  sample: Unit;
  specText: string;
}

function groupUnitsForTemplate(units: Unit[], unitIsLand: boolean): GroupedTypology[] {
  const map = new Map<string, Unit[]>();
  for (const u of units) {
    const key = u.modelName || u.type;
    map.set(key, [...(map.get(key) ?? []), u]);
  }
  return Array.from(map.entries()).map(([label, list]) => {
    const areas = list.map(u => u.totalArea).filter(a => a > 0);
    const priced = list
      .filter(u => typeof u.price === 'number' && u.price > 0)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    const sample = list.find(u => u.interiorImageUrl || u.floorPlan3dUrl) ?? list[0];
    const minArea = areas.length ? Math.min(...areas) : 0;
    const cat = unitIsDwelling(sample) ? null : UNIT_CATEGORY_LABEL[unitCategory(sample)];
    const parts = [
      cat,
      !cat && !unitIsLand && sample.bedrooms > 0 ? `${sample.bedrooms} dorm.` : !cat && !unitIsLand ? 'Monoambiente' : null,
      !unitIsLand && sample.bathrooms > 0 ? `${sample.bathrooms} ${sample.bathrooms === 1 ? 'baño' : 'baños'}` : null,
      minArea > 0 ? `desde ${minArea} m²` : null,
    ].filter(Boolean);
    return {
      id: label,
      label,
      count: list.length,
      availableCount: list.filter(u => u.status === 'available').length,
      minArea,
      minPrice: priced[0]?.price ?? null,
      currency: priced[0]?.currency,
      image: sample.interiorImageUrl || sample.floorPlan3dUrl || null,
      sample,
      specText: parts.join(' · '),
    };
  });
}

export default function TypologiesSection({ project, typeConfig, basePath }: SectionProps) {
  if (project.units.length === 0) return null;
  const label = pluralize(typeConfig.unitLabel);
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const groups = groupUnitsForTemplate(project.units, typeConfig.unitIsLand);

  if (template === 'comercial') {
    return (
      <section id="modelos" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)]">
        <Container>
          <Reveal className="flex flex-wrap gap-6 items-end justify-between mb-10">
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                Tipologías y disponibilidad
              </span>
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.2vw,56px)] leading-[1.02] font-bold tracking-[-0.03em] text-[var(--theme-text)]">
                Elegí tu {typeConfig.unitLabel.toLowerCase()} ideal
              </h2>
            </div>
            {typeConfig.hasUnitStep && (
              <Pill href={`${basePath}/unidades`} arrow>
                Ver todas ({project.units.length})
              </Pill>
            )}
          </Reveal>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g, i) => (
              <Reveal key={g.id} delay={Math.min(i, 3) * 0.05}>
                <Link
                  href={`${basePath}/edificio/${g.sample.buildingId}/unidad/${g.sample.id}`}
                  className="tpl-card group flex flex-col h-full overflow-hidden rounded-[var(--theme-radius)] bg-[var(--theme-surface)] border border-[var(--theme-border)] hover:border-[var(--theme-accent)] no-underline text-[var(--theme-text)] shadow-sm"
                >
                  <div className="relative aspect-[16/10] bg-[var(--theme-border)] overflow-hidden">
                    {g.image && (
                      <Image
                        src={g.image}
                        alt={g.label}
                        fill
                        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                        placeholder="blur"
                        blurDataURL={shimmerDataUrl()}
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    )}
                    {typeConfig.showStatus && g.availableCount > 0 && (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[var(--theme-surface)]/95 text-[var(--theme-text)] text-xs font-semibold shadow-sm">
                        {g.availableCount} disponible{g.availableCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-1.5">
                      <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-xl font-bold tracking-[-0.02em]">
                        {g.label}
                      </h3>
                      {g.specText && (
                        <p className="m-0 text-sm text-[var(--theme-text-muted)]">{g.specText}</p>
                      )}
                    </div>
                    <div className="pt-3 border-t border-[var(--theme-border)] flex items-center justify-between gap-3">
                      {typeConfig.showPrice && g.minPrice ? (
                        <span className="font-[family-name:var(--theme-font-heading)] text-lg font-bold text-[var(--theme-text)]">
                          Desde {formatPrice(g.minPrice, g.currency)}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-[var(--theme-text-muted)]">Ver ficha completa</span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-accent)]">
                        Explorar <ArrowIcon />
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  if (template === 'editorial') {
    return (
      <section id="modelos" className="py-[var(--theme-spacing)] bg-[var(--theme-bg)] border-t border-[var(--theme-border)]">
        <Container>
          <Reveal className="flex flex-wrap gap-6 items-end justify-between pb-6 mb-4">
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-[var(--theme-text-muted)]">
                Tipologías y plantas
              </span>
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.2vw,60px)] leading-none font-medium tracking-[-0.03em] text-[var(--theme-text)]">
                Catálogo de espacios
              </h2>
            </div>
            {typeConfig.hasUnitStep && (
              <Pill href={`${basePath}/unidades`} variant="ghost" arrow>
                {project.units.length === 1 ? `Ver ${typeConfig.unitLabel.toLowerCase()}` : `Ver ${project.units.length} ${label.toLowerCase()}`}
              </Pill>
            )}
          </Reveal>
          <div className="divide-y divide-[var(--theme-border)] border-y border-[var(--theme-border)]">
            {groups.map((g, i) => (
              <Link
                key={g.id}
                href={`${basePath}/edificio/${g.sample.buildingId}/unidad/${g.sample.id}`}
                className="ed-row group py-5 flex flex-wrap sm:flex-nowrap items-center gap-5 no-underline text-[var(--theme-text)]"
              >
                <span className="text-xs font-mono text-[var(--theme-text-muted)] w-8 shrink-0">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-[200px]">
                  <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-2xl font-medium tracking-[-0.02em] group-hover:text-[var(--theme-accent)] transition-colors">
                    {g.label}
                  </h3>
                  {g.specText && <p className="m-0 mt-1 text-sm text-[var(--theme-text-muted)]">{g.specText}</p>}
                </div>
                {typeConfig.showPrice && g.minPrice && (
                  <span className="text-sm font-medium text-[var(--theme-text)] shrink-0 tabular-nums">
                    Desde {formatPrice(g.minPrice, g.currency)}
                  </span>
                )}
                {g.image && (
                  <div className="relative w-24 h-16 rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-surface)] border border-[var(--theme-border)] shrink-0">
                    <Image src={g.image} alt={g.label} fill sizes="96px" placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover" />
                  </div>
                )}
                <span className="shrink-0 w-9 h-9 rounded-full border border-[var(--theme-border)] flex items-center justify-center group-hover:bg-[var(--theme-text)] group-hover:text-[var(--theme-bg)] transition-colors">
                  <ArrowIcon />
                </span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    );
  }

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
