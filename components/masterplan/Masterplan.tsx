'use client';

import { useState, useCallback } from 'react';
import Image from 'next/image';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import type { Unit, FilterState } from '@/types';
import UnitPolygon from './UnitPolygon';
import UnitModal from './UnitModal';

interface MasterplanProps {
  imageUrl: string;
  units: Unit[];
  projectSlug: string;
}

export default function Masterplan({ imageUrl, units, projectSlug }: MasterplanProps) {
  const router = useTransitionRouter();
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>({
    status: 'all',
    type: 'all',
    building: 'all',
    floor: 'all',
  });

  const filteredUnits = units.filter((unit) => {
    if (filters.status !== 'all' && unit.status !== filters.status) return false;
    if (filters.type !== 'all' && unit.type !== filters.type) return false;
    if (filters.building !== 'all' && unit.building !== filters.building) return false;
    if (filters.floor !== 'all' && unit.floor !== filters.floor) return false;
    return true;
  });

  const handleSelectUnit = useCallback((unit: Unit) => {
    setSelectedUnit(unit);
  }, []);

  const handleCloseModal = useCallback(() => {
    setSelectedUnit(null);
  }, []);

  // Extract unique values for filters
  const buildings = [...new Set(units.map((u) => u.building))];
  const floors = [...new Set(units.map((u) => u.floor))].sort();
  const types = [...new Set(units.map((u) => u.type))];

  // Stats
  const availableCount = units.filter((u) => u.status === 'available').length;
  const reservedCount = units.filter((u) => u.status === 'reserved').length;
  const soldCount = units.filter((u) => u.status === 'sold').length;

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* Sidebar filters */}
      <aside className="w-full lg:w-72 shrink-0 space-y-5">
        {/* Stats cards */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Disponibilidad
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Disponibles" count={availableCount} color="bg-status-available" />
            <StatCard label="Reservados" count={reservedCount} color="bg-status-reserved" />
            <StatCard label="Vendidos" count={soldCount} color="bg-status-sold" />
          </div>
        </div>

        {/* Filters */}
        <div className="glass rounded-2xl p-5 space-y-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40">
            Filtros
          </h3>

          <FilterSelect
            label="Estado"
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v as FilterState['status'] }))}
            options={[
              { value: 'all', label: 'Todos' },
              { value: 'available', label: 'Disponible' },
              { value: 'reserved', label: 'Reservado' },
              { value: 'sold', label: 'Vendido' },
            ]}
          />

          <FilterSelect
            label="Tipología"
            value={filters.type}
            onChange={(v) => setFilters((f) => ({ ...f, type: v as FilterState['type'] }))}
            options={[
              { value: 'all', label: 'Todas' },
              ...types.map((t) => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) })),
            ]}
          />

          <FilterSelect
            label="Torre"
            value={filters.building}
            onChange={(v) => setFilters((f) => ({ ...f, building: v }))}
            options={[
              { value: 'all', label: 'Todas' },
              ...buildings.map((b) => ({ value: b, label: b })),
            ]}
          />

          <FilterSelect
            label="Piso"
            value={String(filters.floor)}
            onChange={(v) => setFilters((f) => ({ ...f, floor: v === 'all' ? 'all' : Number(v) }))}
            options={[
              { value: 'all', label: 'Todos' },
              ...floors.map((f) => ({ value: String(f), label: `Piso ${f}` })),
            ]}
          />

          <button
            onClick={() =>
              setFilters({ status: 'all', type: 'all', building: 'all', floor: 'all' })
            }
            className="w-full py-2 text-sm text-white/50 hover:text-white transition-colors rounded-lg hover:bg-white/5"
          >
            Limpiar filtros
          </button>
        </div>

        {/* Legend */}
        <div className="glass rounded-2xl p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/40 mb-3">
            Leyenda
          </h3>
          <div className="space-y-2">
            <LegendItem color="bg-status-available" label="Disponible" />
            <LegendItem color="bg-status-reserved" label="Reservado" />
            <LegendItem color="bg-status-sold" label="Vendido" />
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
              alt="Masterplan del proyecto"
              width={1600}
              height={900}
              priority
              className="w-full h-auto block"
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
          Hacé clic en una unidad para ver detalles · Pasá el mouse para previsualizarla
        </p>
      </div>

      {/* Modal */}
      <UnitModal
        unit={selectedUnit}
        projectSlug={projectSlug}
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
  // Position tooltip near the center of the polygon
  const centerX = unit.polygon.reduce((sum, p) => sum + p.x, 0) / unit.polygon.length;
  const centerY = unit.polygon.reduce((sum, p) => sum + p.y, 0) / unit.polygon.length;

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
          {unit.area}m² · {unit.type}
        </p>
      </div>
    </div>
  );
}
