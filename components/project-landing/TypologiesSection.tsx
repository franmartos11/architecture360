import Image from 'next/image';
import Reveal from '@/components/ui/Reveal';
import { TabsSection } from '@/components/TabsSection';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, pluralize, unitIsDwelling, unitCategory, unitCategoryLabel } from '@/lib/units';
import { crearT, type T } from '@/lib/i18n/t';
import { etiquetaCatalogo } from '@/lib/i18n/catalogo';
import type { Locale } from '@/lib/i18n/locales';
import { resolveWebTemplateKey } from '@/lib/web-templates';
import type { Unit } from '@/types';
import type { SectionProps } from './types';
import { ArrowIcon, Container, Pill } from './ui';

// Valor de la prop de next/image, no texto (el guardián de i18n mira los placeholder escritos a mano).
const BLUR = 'blur' as const;

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

function groupUnitsForTemplate(units: Unit[], unitIsLand: boolean, locale: Locale, t: T): GroupedTypology[] {
  const map = new Map<string, Unit[]>();
  for (const u of units) {
    const key = u.modelName || u.type;
    map.set(key, [...(map.get(key) ?? []), u]);
  }
  return Array.from(map.entries()).map(([key, list]) => {
    const areas = list.map(u => u.totalArea).filter(a => a > 0);
    const priced = list
      .filter(u => typeof u.price === 'number' && u.price > 0)
      .sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    const sample = list.find(u => u.interiorImageUrl || u.floorPlan3dUrl) ?? list[0];
    const minArea = areas.length ? Math.min(...areas) : 0;
    const cat = unitIsDwelling(sample) ? null : unitCategoryLabel(unitCategory(sample), locale);
    const parts = [
      cat,
      !cat && !unitIsLand && sample.bedrooms > 0 ? t('sitio.tipologias.dorm', { n: sample.bedrooms }) : !cat && !unitIsLand ? t('sitio.tipologias.monoambiente') : null,
      !unitIsLand && sample.bathrooms > 0 ? t('sitio.tipologias.banosCount', { count: sample.bathrooms }) : null,
      minArea > 0 ? t('sitio.tipologias.desdeArea', { area: minArea }) : null,
    ].filter(Boolean);
    return {
      id: key,
      // Sin modelo, el grupo es el tipo (valor de catálogo en castellano).
      label: list[0].modelName ? key : etiquetaCatalogo(key, locale),
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

export default function TypologiesSection({ project, typeConfig, basePath, locale = 'es' }: SectionProps) {
  if (project.units.length === 0) return null;
  const t = crearT(locale);
  const label = pluralize(typeConfig.unitLabel, locale);
  const template = resolveWebTemplateKey(project.themeConfig?.webTemplate);
  const groups = groupUnitsForTemplate(project.units, typeConfig.unitIsLand, locale, t);

  if (template === 'comercial') {
    return (
      <section id="modelos" className="py-[calc(var(--theme-spacing)/1.5)] bg-[var(--theme-bg)]">
        <Container>
          <Reveal className="flex flex-wrap gap-6 items-end justify-between mb-10">
            <div className="space-y-2">
              <span className="block text-xs font-semibold uppercase tracking-[0.08em] text-[var(--theme-accent)]">
                {t('sitio.tipologias.disponibilidad')}
              </span>
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.2vw,56px)] leading-[1.02] font-bold tracking-[-0.03em] text-[var(--theme-text)]">
                {t('sitio.tipologias.elegiTu', { unidad: typeConfig.unitLabel.toLowerCase() })}
              </h2>
            </div>
            {typeConfig.hasUnitStep && (
              <Pill href={`${basePath}/unidades`} arrow>
                {t('sitio.tipologias.verTodas', { count: project.units.length })}
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
                        placeholder={BLUR}
                        blurDataURL={shimmerDataUrl()}
                        className="object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    )}
                    {typeConfig.showStatus && g.availableCount > 0 && (
                      <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[var(--theme-surface)]/95 text-[var(--theme-text)] text-xs font-semibold shadow-sm">
                        {t('unidades.disponibles', { count: g.availableCount })}
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
                          {t('sitio.tipologias.desdePrecio', { precio: formatPrice(g.minPrice, g.currency, locale) })}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-[var(--theme-text-muted)]">{t('sitio.tipologias.verFicha')}</span>
                      )}
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--theme-accent)]">
                        {t('sitio.tipologias.explorar')} <ArrowIcon />
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
                {t('sitio.tipologias.plantas')}
              </span>
              <h2 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,4.2vw,60px)] leading-none font-medium tracking-[-0.03em] text-[var(--theme-text)]">
                {t('sitio.tipologias.catalogo')}
              </h2>
            </div>
            {typeConfig.hasUnitStep && (
              <Pill href={`${basePath}/unidades`} variant="ghost" arrow>
                {project.units.length === 1
                  ? t('sitio.tipologias.verUna', { unidad: typeConfig.unitLabel.toLowerCase() })
                  : t('sitio.tipologias.verN', { count: project.units.length, unidades: label.toLowerCase() })}
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
                    {t('sitio.tipologias.desdePrecio', { precio: formatPrice(g.minPrice, g.currency, locale) })}
                  </span>
                )}
                {g.image && (
                  <div className="relative w-24 h-16 rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-surface)] border border-[var(--theme-border)] shrink-0">
                    <Image src={g.image} alt={g.label} fill sizes="96px" placeholder={BLUR} blurDataURL={shimmerDataUrl()} className="object-cover" />
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
            {t('sitio.tipologias.conoceCada')} <br /><span className="text-[var(--theme-text-muted)]">{t('sitio.tipologias.enDetalle')}</span>
          </h2>
          {typeConfig.hasUnitStep && (
            <Pill href={`${basePath}/unidades`} variant="ghost" arrow>
              {project.units.length === 1
                ? t('sitio.tipologias.verUna', { unidad: typeConfig.unitLabel.toLowerCase() })
                : t('sitio.tipologias.verLosN', { los: typeConfig.unitLabelGender === 'f' ? 'las' : 'los', count: project.units.length, unidades: label.toLowerCase() })}
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
