'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice } from '@/lib/units';
import type { Unit } from '@/types';

interface TypologyGroup {
  id: string;
  label: string;
  bedrooms: number;
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
    const sampleUnit = groupUnits[0];
    return {
      id: key,
      label: key,
      bedrooms: sampleUnit.bedrooms,
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
  return `${min} - ${max} m²`;
}

function formatPriceRange(min: number | null, currency?: string): string {
  return min == null ? '' : `Desde ${formatPrice(min, currency)}`;
}

export function TabsSection({ units, projectSlug, showPrice }: { units: Unit[]; projectSlug: string; showPrice: boolean }) {
  const typologies = useMemo(() => buildTypologies(units), [units]);
  const [activeTab, setActiveTab] = useState(typologies[0]?.id ?? '');

  const activeData = typologies.find(t => t.id === activeTab) ?? typologies[0];
  if (!activeData) return null;

  return (
    <div className="w-full">
      {/* Tab headers */}
      <div className="flex flex-wrap gap-x-8 gap-y-2 border-b border-[var(--theme-border)] mb-12">
        {typologies.map((tab) => {
          const isActive = tab.id === activeData.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="pb-4 text-sm font-semibold tracking-widest transition-colors whitespace-nowrap"
              style={{
                color: isActive ? 'var(--theme-text)' : 'var(--theme-text-muted)',
                borderBottom: isActive ? '2px solid var(--theme-accent)' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {tab.label.toUpperCase()}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="grid md:grid-cols-2 gap-12 items-center animate-fade-in-up" key={activeData.id}>
        <div className="space-y-6">
          <div>
            <h2 className="font-[family-name:var(--theme-font-heading)] text-4xl font-light text-[var(--theme-text)] mb-2">{activeData.label}</h2>
            <div className="text-[var(--theme-accent)] tracking-wide">
              {activeData.bedrooms > 0 ? `${activeData.bedrooms} dormitorio${activeData.bedrooms === 1 ? '' : 's'}` : 'Sin dormitorios'}
            </div>
          </div>

          <div className="space-y-1">
            {(activeData.minArea > 0 || activeData.maxArea > 0) && (
              <h3 className="text-xl font-medium text-[var(--theme-text)]">{formatArea(activeData.minArea, activeData.maxArea)}</h3>
            )}
            {showPrice && activeData.minPrice != null && (
              <h3 className="text-xl font-medium text-[var(--theme-text)]">{formatPriceRange(activeData.minPrice, activeData.sampleUnit.currency)}</h3>
            )}
          </div>

          <div className="pt-4">
            <a
              href={`/proyecto/${projectSlug}/edificio/${activeData.sampleUnit.buildingId}/unidad/${activeData.sampleUnit.id}`}
              className="inline-block px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm"
            >
              CONOCER {activeData.label.toUpperCase()}
            </a>
          </div>
        </div>

        <div className="relative h-[400px] md:h-[500px] w-full rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
          {activeData.image ? (
            <Image
              src={activeData.image}
              alt={activeData.label}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              placeholder="blur"
              blurDataURL={shimmerDataUrl()}
              className="object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--theme-text-muted)] text-sm">Sin imagen todavía</div>
          )}
        </div>
      </div>
    </div>
  );
}
