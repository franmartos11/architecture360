'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { formatPrice, getStatusLabel, getStatusColor } from '@/lib/units';
import type { Project, Unit, UnitStatus, UnitType } from '@/types';

interface UnitsListViewProps {
  project: Project;
  initialBuildingFilter?: string;
}

const TYPE_LABELS: Record<UnitType, string> = {
  monoambiente: 'Monoambiente',
  '1 dormitorio': '1 Dormitorio',
  '2 dormitorios': '2 Dormitorios',
  '3 dormitorios': '3 Dormitorios',
  penthouse: 'Penthouse',
};

const STATUS_ORDER: (UnitStatus | 'all')[] = ['all', 'available', 'reserved', 'sold'];
const STATUS_LABELS: Record<UnitStatus | 'all', string> = {
  all: 'Cualquiera',
  available: 'Disponibles',
  reserved: 'Reservados',
  sold: 'Vendidos',
};

export default function UnitsListView({ project, initialBuildingFilter }: UnitsListViewProps) {
  const [buildingFilter, setBuildingFilter] = useState<string>(
    initialBuildingFilter && project.buildings.some(b => b.id === initialBuildingFilter)
      ? initialBuildingFilter
      : 'all'
  );
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');

  const typesPresent = useMemo(() => {
    const set = new Set(project.units.map(u => u.type));
    return Array.from(set);
  }, [project.units]);

  const filtered = useMemo(() => {
    return project.units.filter(u => {
      const matchBuilding = buildingFilter === 'all' || u.buildingId === buildingFilter;
      const matchType = typeFilter === 'all' || u.type === typeFilter;
      const matchStatus = statusFilter === 'all' || u.status === statusFilter;
      return matchBuilding && matchType && matchStatus;
    }).sort((a, b) => a.buildingId.localeCompare(b.buildingId) || a.floor - b.floor || a.name.localeCompare(b.name));
  }, [project.units, buildingFilter, typeFilter, statusFilter]);

  const availableCount = useMemo(() => project.units.filter(u => u.status === 'available').length, [project.units]);
  const pricedUnits = useMemo(() => project.units.filter(u => u.price != null), [project.units]);
  const minPrice = pricedUnits.length > 0 ? Math.min(...pricedUnits.map(u => u.price!)) : null;

  const heroImage = project.aerialSlides[0]?.imageUrl;

  return (
    <div className="min-h-screen bg-trevo-light">
      {/* ── Hero header ─────────────────────────────────────── */}
      <section className="relative pt-32 pb-28 sm:pb-32 px-4 sm:px-6 overflow-hidden bg-trevo-dark">
        {heroImage && (
          <div className="absolute inset-0">
            <Image
              src={heroImage}
              alt={project.name}
              fill
              sizes="100vw"
              priority
              placeholder="blur"
              blurDataURL={shimmerDataUrl(1920, 1080)}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-trevo-dark/80 via-trevo-dark/60 to-trevo-dark" />
          </div>
        )}

        <div className="relative max-w-6xl mx-auto">
          <Link
            href={`/proyecto/${project.slug}`}
            className="text-xs font-semibold tracking-widest text-white/60 hover:text-white transition-colors"
          >
            ← {project.name.toUpperCase()}
          </Link>
          <div className="text-trevo-lightgreen tracking-widest text-sm font-semibold mt-6">UNIDADES DISPONIBLES</div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-thin tracking-wide text-white leading-tight mt-3 max-w-2xl">
            Encontrá tu <span className="font-medium">próximo hogar</span>
          </h1>

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 sm:gap-x-10 gap-y-4 sm:gap-y-3 mt-10">
            <Stat value={project.units.length} label="Unidades" />
            <Stat value={availableCount} label="Disponibles" />
            {project.buildings.length > 1 && <Stat value={project.buildings.length} label="Edificios" />}
            {minPrice != null && <Stat value={formatPrice(minPrice)} label="Desde" />}
          </div>
        </div>
      </section>

      {/* ── Filters: floating card over the hero/content seam ──── */}
      <div className="px-4 sm:px-6 -mt-16 sm:-mt-20 relative z-10">
        <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl border border-trevo-dark/5 p-6 sm:p-8 space-y-6">
          {project.buildings.length > 1 && (
            <FilterRow label="Edificio">
              <TabTrigger active={buildingFilter === 'all'} onClick={() => setBuildingFilter('all')}>
                Todos
              </TabTrigger>
              {project.buildings.map(b => (
                <TabTrigger key={b.id} active={buildingFilter === b.id} onClick={() => setBuildingFilter(b.id)}>
                  {b.name}
                </TabTrigger>
              ))}
            </FilterRow>
          )}

          {typesPresent.length > 0 && (
            <FilterRow label="Tipología">
              <TabTrigger active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
                Todas
              </TabTrigger>
              {typesPresent.map(t => (
                <TabTrigger key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                  {TYPE_LABELS[t]}
                </TabTrigger>
              ))}
            </FilterRow>
          )}

          <FilterRow label="Disponibilidad" last>
            {STATUS_ORDER.map(s => (
              <TabTrigger key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}>
                {STATUS_LABELS[s]}
              </TabTrigger>
            ))}
          </FilterRow>
        </div>
      </div>

      {/* ── Grid ─────────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 pt-12 pb-24">
        <div className="max-w-6xl mx-auto">
          <p className="text-sm text-trevo-dark/50 font-light mb-6">
            {filtered.length} de {project.units.length} unidades
          </p>

          {filtered.length === 0 ? (
            <div className="text-center py-20 text-trevo-dark/40 font-light">
              {project.units.length === 0 ? 'Todavía no hay unidades cargadas.' : 'No hay unidades para este filtro.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
              {filtered.map(u => (
                <UnitCard
                  key={u.id}
                  unit={u}
                  projectSlug={project.slug}
                  buildingName={project.buildings.find(b => b.id === u.buildingId)?.name}
                />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-2xl sm:text-3xl font-light text-white">{value}</div>
      <div className="text-[11px] uppercase tracking-widest text-white/50 mt-0.5">{label}</div>
    </div>
  );
}

function FilterRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? '' : 'pb-6 border-b border-trevo-dark/5'}>
      <div className="text-[11px] uppercase font-semibold tracking-widest text-trevo-brown mb-3">{label}</div>
      <div className="flex flex-wrap gap-2">
        {children}
      </div>
    </div>
  );
}

function TabTrigger({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 rounded-full text-sm font-medium tracking-wide border transition-colors whitespace-nowrap ${
        active
          ? 'bg-trevo-dark text-white border-trevo-dark'
          : 'bg-transparent text-trevo-dark/60 border-trevo-dark/15 hover:border-trevo-dark/40 hover:text-trevo-dark'
      }`}
    >
      {children}
    </button>
  );
}

function UnitCard({
  unit,
  buildingName,
  projectSlug,
}: {
  unit: Unit;
  buildingName?: string;
  projectSlug: string;
}) {
  const statusColor = getStatusColor(unit.status);
  return (
    <Link
      href={`/proyecto/${projectSlug}/edificio/${unit.buildingId}/unidad/${unit.id}`}
      className="group block rounded-2xl overflow-hidden bg-white border border-trevo-dark/10 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
    >
      <div className="relative aspect-[3/2] bg-trevo-dark/10">
        {unit.interiorImageUrl ? (
          <Image
            src={unit.interiorImageUrl}
            alt={unit.name}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            placeholder="blur"
            blurDataURL={shimmerDataUrl()}
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-trevo-dark/20 text-xs">Sin foto</div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
        <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full bg-white/90 backdrop-blur text-trevo-dark shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          {getStatusLabel(unit.status)}
        </span>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-xs text-white/70 tracking-widest uppercase font-medium">
            {[buildingName, unit.floor === 0 ? 'Planta baja' : `Piso ${unit.floor}`].filter(Boolean).join(' · ')}
          </p>
          <h3 className="text-white text-lg font-medium">{unit.name}</h3>
        </div>
      </div>

      <div className="p-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-trevo-dark font-medium">{TYPE_LABELS[unit.type]}</p>
          <p className="text-xs text-trevo-dark/50 font-light mt-0.5">{unit.totalArea} m² · {unit.bedrooms} dorm · {unit.bathrooms} baños</p>
        </div>
        <p className="text-sm font-semibold text-trevo-dark whitespace-nowrap">
          {unit.price ? formatPrice(unit.price) : 'Consultar'}
        </p>
      </div>
    </Link>
  );
}
