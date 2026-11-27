'use client';

import { useState, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import type { Unit } from '@/types';
import UnitPolygon from './UnitPolygon';
import UnitModal from './UnitModal';
import { useLocale, useT } from '@/lib/i18n/client';
import { etiquetaCatalogo } from '@/lib/i18n/catalogo';
import { unitTypeLabel } from '@/lib/units';

interface MasterplanProps {
  imageUrl: string;
  units: Unit[];
}

interface FilterState {
  status: Unit['status'] | 'all';
  type: Unit['type'] | 'all';
  buildingId: string | 'all';
  floor: number | 'all';
}

export default function Masterplan({ imageUrl, units }: MasterplanProps) {
  const router = useTransitionRouter();
  const t = useT();
  const { locale } = useLocale();
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    type: 'all',
    buildingId: 'all',
    floor: 'all',
  });

  const filteredUnits = useMemo(() => {
    return units.filter((unit) => {
      if (filters.status !== 'all' && unit.status !== filters.status) return false;
      if (filters.type !== 'all' && unit.type !== filters.type) return false;
      if (filters.buildingId !== 'all' && unit.buildingId !== filters.buildingId) return false;
      if (filters.floor !== 'all' && unit.floor !== filters.floor) return false;
      return true;
    });
  }, [units, filters]);

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnit(unit);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  // Extract unique values for filters
  const buildings = useMemo(() => [...new Set(units.map((u) => u.buildingId))], [units]);
  const floors = useMemo(() => [...new Set(units.map((u) => u.floor))].sort(), [units]);
  const types = useMemo(() => [...new Set(units.map((u) => u.type))], [units]);

  // Stats
  const { availableCount, reservedCount, soldCount } = useMemo(() => {
    return {
      availableCount: units.filter((u) => u.status === 'available').length,
      reservedCount: units.filter((u) => u.status === 'reserved').length,
      soldCount: units.filter((u) => u.status === 'sold').length,
    };
  }, [units]);

  return (
    <div className="flex flex-col-reverse lg:flex-row gap-6 w-full">
      {/* Sidebar filters */}
      <aside className="w-full lg:w-72 shrink-0 space-y-5">
        {/* Stats cards */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            {t('resto.masterplan.disponibilidad')}
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('resto.masterplan.disponibles')} count={availableCount} color="bg-status-available" />
            <StatCard label={t('resto.masterplan.reservados')} count={reservedCount} color="bg-status-reserved" />
            <StatCard label={t('resto.masterplan.vendidos')} count={soldCount} color="bg-status-sold" />
          </div>
        </div>

        {/* Filters */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            {t('resto.masterplan.filtros')}
          </h3>

          <FilterSelect
            label={t('resto.masterplan.estado')}
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as FilterState['status'] }))}
            options={[
              { value: 'all', label: t('resto.masterplan.todos') },
              { value: 'available', label: t('resto.masterplan.disponible') },
              { value: 'reserved', label: t('resto.masterplan.reservado') },
              { value: 'sold', label: t('resto.masterplan.vendido') },
            ]}
          />

          <FilterSelect
            label={t('resto.masterplan.tipologia')}
            value={filters.type}
            onChange={(v) => setFilters((f) => ({ ...f, type: v as FilterState['type'] }))}
            options={[
              { value: 'all', label: t('resto.masterplan.todas') },
              ...types.map((tipo) => ({ value: tipo, label: unitTypeLabel(tipo, locale) })),
            ]}
          />

          <FilterSelect
            label={t('resto.masterplan.torre')}
            value={filters.buildingId}
            onChange={(v) => setFilters((f) => ({ ...f, buildingId: v }))}
            options={[
              { value: 'all', label: t('resto.masterplan.todas') },
              ...buildings.map((b) => ({ value: b, label: b })),
            ]}
          />

          <FilterSelect
            label={t('resto.masterplan.piso')}
            value={String(filters.floor)}
            onChange={(v) => setFilters((f) => ({ ...f, floor: v === 'all' ? 'all' : Number(v) }))}
            options={[
              { value: 'all', label: t('resto.masterplan.todos') },
              ...floors.map((f) => ({ value: String(f), label: t('resto.masterplan.pisoN', { n: f }) })),
            ]}
          />

          <button
            onClick={() =>
              setFilters({ status: 'all', type: 'all', buildingId: 'all', floor: 'all' })
            }
            className="w-full py-2 text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            {t('resto.masterplan.limpiarFiltros')}
          </button>
        </div>

        {/* Legend */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            {t('resto.masterplan.leyenda')}
          </h3>
          <div className="space-y-2">
            <LegendItem color="bg-status-available" label={t('resto.masterplan.disponible')} />
            <LegendItem color="bg-status-reserved" label={t('resto.masterplan.reservado')} />
            <LegendItem color="bg-status-sold" label={t('resto.masterplan.vendido')} />
          </div>
        </div>
      </aside>

      {/* Masterplan viewer */}
      <div className="flex-1 min-w-0">
        <div className="glass rounded-2xl overflow-hidden">
          <div className="relative select-none">
            {/* Background image */}
            <Image
              src={imageUrl}
              alt={t('resto.masterplan.alt')}
              width={1600}
              height={900}
              priority
              className="w-full h-auto block min-h-[300px] object-cover"
              draggable={false}
            />

            {/* SVG overlay */}
            <svg
              className="absolute inset-0 w-full h-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {filteredUnits.map((unit) => (
                <UnitPolygon
                  key={unit.id}
                  unit={unit}
                  isHovered={hoveredUnit === unit.id}
                  onHover={setHoveredUnit}
                  onSelect={handleSelectUnit}
                />
              ))}
            </svg>

            {/* Hover tooltip */}
            {hoveredUnit && (
              <HoverTooltip
                unit={units.find((u) => u.id === hoveredUnit)!}
              />
            )}
          </div>
        </div>

        {/* Instruction text */}
        <p className="text-center text-sm text-white/30 mt-3">
          {t('resto.masterplan.instruccion')}
        </p>
      </div>

      {/* Modal */}
      <UnitModal
        unit={selectedUnit}
        onClose={handleCloseModal}
      />
    </div>
  );
}

/* ─── Sub-components ───────────────────────────────────────────── */

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="text-center">
      <div className={`w-3 h-3 rounded-full ${color} mx-auto mb-1.5 opacity-80`} />
      <div className="text-xl font-bold text-white">{count}</div>
      <div className="text-[10px] text-white/40 leading-tight">{label}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80 focus:outline-none focus:ring-1 focus:ring-brand-500/50 focus:border-brand-500/50 transition-all appearance-none cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-100 text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`w-4 h-3 rounded-sm ${color} opacity-50`} />
      <span className="text-sm text-white/60">{label}</span>
    </div>
  );
}

function HoverTooltip({ unit }: { unit: Unit }) {
  const { locale } = useLocale();
  // Position tooltip near the center of the polygon
  const polygon = unit.polygon || [];
  if (polygon.length === 0) return null;
  const centerX = polygon.reduce((sum, p) => sum + p.x, 0) / polygon.length;
  const centerY = polygon.reduce((sum, p) => sum + p.y, 0) / polygon.length;

  return (
    <div
      className="absolute pointer-events-none z-20 animate-fade-in-up"
      style={{
        left: `${centerX}%`,
        top: `${centerY}%`,
        transform: 'translate(-50%, -120%)',
      }}
    >
      <div className="glass rounded-lg px-3 py-2 text-center whitespace-nowrap">
        <p className="text-xs font-semibold text-white">{unit.name}</p>
        <p className="text-[10px] text-white/50">
          {unit.totalArea}m² · {etiquetaCatalogo(unit.type, locale)}
        </p>
      </div>
    </div>
  );
}
