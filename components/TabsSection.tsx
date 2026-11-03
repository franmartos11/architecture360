'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, unitIsDwelling, unitCategory, UNIT_CATEGORY_LABEL } from '@/lib/units';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { Pill } from '@/components/project-landing/ui';
import type { Unit } from '@/types';

interface TypologyGroup {
  id: string;
  label: string;
  bedrooms: number;
  // null = vivienda; si no, la etiqueta de la categoría (local / cochera).
  categoryLabel: string | null;
  minArea: number;
  maxArea: number;
  minPrice: number | null;
  maxPrice: number | null;
  image: string | null;
  sampleUnit: Unit;
}

function buildTypologies(units: Unit[]): TypologyGroup[] {
  const groups = new Map<string, Unit[]>();
  for (const u of units) {
    const key = u.modelName || u.type;
    groups.set(key, [...(groups.get(key) ?? []), u]);
  }

  return Array.from(groups.entries()).map(([key, groupUnits]) => {
    const areas = groupUnits.map(u => u.totalArea).filter(a => a > 0);
    const prices = groupUnits.map(u => u.price).filter((p): p is number => p != null && p > 0);
    // La foto de muestra: la primera unidad del grupo que tenga alguna.
    const withImage = groupUnits.find(u => u.interiorImageUrl || u.floorPlan3dUrl);
    const sampleUnit = withImage ?? groupUnits[0];
    return {
      id: key,
      label: key,
      bedrooms: sampleUnit.bedrooms,
      categoryLabel: unitIsDwelling(sampleUnit) ? null : UNIT_CATEGORY_LABEL[unitCategory(sampleUnit)],
      minArea: areas.length ? Math.min(...areas) : 0,
      maxArea: areas.length ? Math.max(...areas) : 0,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      image: sampleUnit.interiorImageUrl || sampleUnit.floorPlan3dUrl || null,
      sampleUnit,
    };
  });
}

function formatArea(min: number, max: number): string {
  if (!min && !max) return '';
  if (min === max) return `${min} m²`;
  return `${min} – ${max} m²`;
}

export function TabsSection({ units, showPrice, unitIsLand = false, kindLabel }: { units: Unit[]; showPrice: boolean; unitIsLand?: boolean; kindLabel: string }) {
  const basePath = useProjectBasePath();
  const typologies = useMemo(() => buildTypologies(units), [units]);
  const [activeTab, setActiveTab] = useState(typologies[0]?.id ?? '');

  const activeData = typologies.find(t => t.id === activeTab) ?? typologies[0];
  if (!activeData) return null;

  // Un lote es terreno — no tiene dormitorios que anunciar. Un local /
  // cochera tampoco: se anuncia su categoría en el rótulo de arriba.
  const bedroomsText = activeData.categoryLabel
    ? null
    : activeData.bedrooms > 0 ? `${activeData.bedrooms}` : 'Monoambiente';
  const area = formatArea(activeData.minArea, activeData.maxArea);
  const specs = [
    area && { label: 'Superficie', value: area },
    !unitIsLand && bedroomsText && { label: 'Dormitorios', value: bedroomsText },
    activeData.sampleUnit.bathrooms > 0 && !activeData.categoryLabel && { label: 'Baños', value: String(activeData.sampleUnit.bathrooms) },
  ].filter(Boolean).slice(0, 2) as { label: string; value: string }[];

  return (
    <div className="w-full">
      {/* Con muchas tipologías las pestañas scrollean de costado en vez de apilarse en 4 renglones. */}
      <div role="tablist" aria-label="Modelos" className="flex gap-2 overflow-x-auto pb-2 mb-6 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        {typologies.map((tab) => {
          const isActive = tab.id === activeData.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-none h-11 px-[18px] rounded-full border text-sm font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 ${
                isActive
                  ? 'bg-[var(--theme-text)] text-[var(--theme-bg)] border-[var(--theme-text)]'
                  : 'bg-transparent text-[var(--theme-text)] border-[var(--theme-border)] hover:border-[var(--theme-text)]/40'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" key={activeData.id} className="flex flex-wrap gap-6 bg-[var(--theme-surface)] rounded-[calc(var(--theme-radius)*1.4)] p-3 sm:p-4 animate-fade-in-up">
        <div className="relative flex-[999_1_520px] min-w-0 h-[300px] sm:h-[460px] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
          {activeData.image ? (
            <Image
              src={activeData.image}
              alt={`Imagen de referencia del modelo ${activeData.label}`}
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)] text-sm">Sin imagen todavía</div>
          )}
        </div>

        <div className="flex-[1_1_300px] px-2 py-3 sm:px-5 sm:py-6 flex flex-col justify-between gap-8">
          <div className="flex flex-col gap-3.5">
            <span className="inline-flex items-center gap-2.5 text-[11px] tracking-[0.2em] font-bold uppercase text-[var(--theme-text-muted)]">
              <span className="w-[22px] h-px bg-current" aria-hidden="true" />
              {activeData.categoryLabel ?? kindLabel}
            </span>
            <h3 className="m-0 font-[family-name:var(--theme-font-heading)] text-[clamp(32px,3.4vw,44px)] leading-none font-semibold tracking-[-0.035em] text-[var(--theme-text)] break-words">
              {activeData.label}
            </h3>
            {specs.length > 0 && (
              <dl className="m-0 mt-2 grid grid-cols-2 gap-2">
                {specs.map(s => (
                  <div key={s.label} className="bg-[var(--theme-bg)] rounded-[calc(var(--theme-radius)*0.7)] px-4 py-3.5">
                    <dt className="text-[11px] tracking-[0.14em] font-bold uppercase text-[var(--theme-text-muted)]">{s.label}</dt>
                    <dd className="m-0 mt-1.5 text-lg sm:text-xl font-semibold text-[var(--theme-text)]">{s.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {showPrice && (
              <p className="m-0 text-sm text-[var(--theme-text-muted)]">
                {activeData.minPrice != null ? 'Desde' : 'Precio'}
                <span className="block text-[clamp(30px,3vw,40px)] leading-[1.1] font-semibold tracking-[-0.03em] text-[var(--theme-text)]">
                  {activeData.minPrice != null ? formatPrice(activeData.minPrice, activeData.sampleUnit.currency) : 'Consultar'}
                </span>
              </p>
            )}
            <Pill href={`${basePath}/edificio/${activeData.sampleUnit.buildingId}/unidad/${activeData.sampleUnit.id}`} arrow size="lg" block>
              Conocer {activeData.label}
            </Pill>
          </div>
        </div>
      </div>
    </div>
  );
}
