'use client';

import Segmented from '@/components/ui/Segmented';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useSheetDrag } from '@/hooks/useSheetDrag';
import { BACKDROP } from '@/lib/motion';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { formatPrice, getStatusLabel, unitTypeLabel, unitCategory, unitIsDwelling, CATEGORY_COLOR, CATEGORY_INK, CATEGORY_SHORT } from '@/lib/units';
import type { Unit, UnitCategory, UnitStatus, UnitType } from '@/types';

// Lista de unidades en pantallas angostas: pestañas por tipo, un solo botón
// "Ordenar y filtrar" que abre una hoja desde abajo y la lista agrupada por
// piso, donde toda la fila se toca. El estado de los filtros es el de
// UnitsListView (y viaja en la URL); acá solo se agrega el filtro por piso,
// que en escritorio no existe.

export type MobileOrden = 'piso' | 'precio-asc' | 'precio-desc' | 'm2-desc' | 'dorm-desc';

interface Option<T> { value: T; label: string }

export interface MobileUnitsListProps {
  /** Ya filtradas y ordenadas por UnitsListView. */
  units: Unit[];
  allUnits: Unit[];
  buildingName: (id: string) => string | undefined;
  hasMultipleBuildings: boolean;
  buildings: { id: string; name: string }[];
  hasFloorStep: boolean;
  unitIsLand: boolean;
  showPrice: boolean;
  showStatus: boolean;
  showLeads: boolean;
  unitLabelPluralLower: string;
  unitHref: (u: Unit) => string;
  // Pestañas
  categories: { value: UnitCategory; label: string }[];
  categoryFilter: UnitCategory | 'all';
  setCategoryFilter: (c: UnitCategory | 'all') => void;
  // Hoja de filtros
  orden: MobileOrden;
  setOrden: (o: MobileOrden) => void;
  sortOptions: Option<MobileOrden>[];
  statusFilter: UnitStatus | 'all';
  setStatusFilter: (s: UnitStatus | 'all') => void;
  buildingFilter: string;
  setBuildingFilter: (b: string) => void;
  typeFilter: UnitType | 'all';
  setTypeFilter: (t: UnitType | 'all') => void;
  typeOptions: UnitType[];
  maxPrice: number;
  setMaxPrice: (n: number) => void;
  priceBounds: { min: number; max: number } | null;
  minArea: number;
  setMinArea: (n: number) => void;
  areaBounds: { min: number; max: number } | null;
  feats: { key: string; label: string }[];
  selectedFeats: string[];
  setSelectedFeats: (f: string[]) => void;
  onlyFavs: boolean;
  setOnlyFavs: (v: boolean) => void;
  favoritesCount: number;
  onContact: (message?: string) => void;
}

const STATUS_INK: Record<string, string> = { available: '#2E7D4F', reserved: '#A16207', sold: '#B91C1C' };
const STATUS_SHORT: Record<string, string> = { available: 'Disponible', reserved: 'Reservada', sold: 'Vendida' };

const floorName = (n: number) => (n === 0 ? 'Planta baja' : n < 0 ? `Subsuelo ${-n}` : `Piso ${n}`);
const floorShort = (n: number) => (n === 0 ? 'PB' : n < 0 ? `SS${-n}` : String(n));

// Tres cortes "hasta X" repartidos en los valores reales, redondeados.
function thresholds(values: number[], step: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length < 2) return [];
  const cuts = [0.33, 0.66].map(q => Math.ceil(sorted[Math.floor(q * (sorted.length - 1))] / step) * step);
  return [...new Set(cuts)].filter(c => c > sorted[0] && c < sorted[sorted.length - 1]);
}

export default function MobileUnitsList(p: MobileUnitsListProps) {
  const [floorFilter, setFloorFilter] = useState<number | 'all'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);
  const reduced = !!useReducedMotion();
  const sheetDrag = useSheetDrag(() => setSheetOpen(false));


  const shown = useMemo(
    () => (floorFilter === 'all' ? p.units : p.units.filter(u => u.floor === floorFilter)),
    [p.units, floorFilter],
  );

  const floors = useMemo(
    () => [...new Set(p.allUnits.map(u => u.floor))].sort((a, b) => a - b),
    [p.allUnits],
  );
  const showFloorFilter = p.hasFloorStep && floors.length > 1;

  const priceCuts = useMemo(
    () => (p.showPrice && p.priceBounds ? thresholds(p.allUnits.filter(u => u.price != null).map(u => u.price!), 5000) : []),
    [p.allUnits, p.showPrice, p.priceBounds],
  );
  const areaCuts = useMemo(() => {
    const vals = p.allUnits.map(u => u.totalArea).filter(v => v > 0).sort((a, b) => a - b);
    if (vals.length < 2) return [];
    const cuts = [0.33, 0.66].map(q => Math.floor(vals[Math.floor(q * (vals.length - 1))] / 5) * 5);
    return [...new Set(cuts)].filter(c => c > vals[0]);
  }, [p.allUnits]);

  const activeCount =
    (p.orden !== 'piso' ? 1 : 0) +
    (p.statusFilter !== 'all' ? 1 : 0) +
    (p.buildingFilter !== 'all' ? 1 : 0) +
    (p.typeFilter !== 'all' ? 1 : 0) +
    (p.maxPrice > 0 && (!p.priceBounds || p.maxPrice < p.priceBounds.max) ? 1 : 0) +
    (p.minArea > 0 && (!p.areaBounds || p.minArea > p.areaBounds.min) ? 1 : 0) +
    p.selectedFeats.length +
    (p.onlyFavs ? 1 : 0) +
    (floorFilter !== 'all' ? 1 : 0);

  // Limpiar deja la pestaña elegida: es "qué tipo estoy mirando", no un filtro.
  const clearSheet = () => {
    p.setOrden('piso'); p.setStatusFilter('all'); p.setBuildingFilter('all'); p.setTypeFilter('all');
    p.setMaxPrice(0); p.setMinArea(0); p.setSelectedFeats([]); p.setOnlyFavs(false); setFloorFilter('all');
  };

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSheetOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [sheetOpen]);

  // Agrupado por (torre y) piso solo con el orden "por piso"; con otro orden,
  // una sola lista.
  const groups = useMemo(() => {
    if (p.orden !== 'piso' || !p.hasFloorStep) return [{ key: 'all', name: '', rows: shown }];
    const map = new Map<string, Unit[]>();
    for (const u of shown) {
      const k = `${u.buildingId}#${u.floor}`;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(u);
    }
    return [...map.entries()].map(([key, rows]) => {
      const u = rows[0];
      const avail = rows.filter(r => r.status === 'available').length;
      const count = p.showStatus
        ? `${avail} ${avail === 1 ? 'disponible' : 'disponibles'}`
        : `${rows.length} ${p.unitLabelPluralLower}`;
      const place = [p.hasMultipleBuildings ? p.buildingName(u.buildingId) : null, floorName(u.floor)].filter(Boolean).join(' · ');
      return { key, name: `${place} · ${count}`, rows };
    });
  }, [shown, p]);

  const n = shown.length;
  const availableShown = shown.filter(u => u.status === 'available').length;
  const resultLabel = p.showStatus
    ? (availableShown === n ? `${n} ${availableShown === 1 ? 'disponible' : 'disponibles'}` : `${availableShown} de ${n} disponibles`)
    : `${n} ${p.unitLabelPluralLower}`;

  const tabs = p.categories.length > 1
    ? [{ value: 'all' as const, label: 'Todas', n: p.allUnits.length },
       ...p.categories.map(c => ({ value: c.value, label: c.label, n: p.allUnits.filter(u => unitCategory(u) === c.value).length }))]
    : [];

  return (
    <div className="bg-white text-gray-900">
      <div className="px-4 pt-3 border-b border-[#ECEEF0]">
        {tabs.length > 0 && (
          <Segmented
            role="tablist"
            size="tall"
            ariaLabel="Tipo de unidad"
            value={p.categoryFilter}
            onChange={p.setCategoryFilter}
            options={tabs.map(t => ({ value: t.value, label: t.label, sub: t.n }))}
          />
        )}
        <div className="h-[52px] flex items-center justify-between gap-3">
          <span className="text-sm font-semibold truncate">{resultLabel}</span>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            className="h-10 shrink-0 px-3 rounded-[10px] border border-[#D5D9DE] bg-white text-sm font-semibold flex items-center gap-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
            Ordenar y filtrar
            {activeCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-bold flex items-center justify-center">{activeCount}</span>
            )}
          </button>
        </div>
      </div>

      {p.allUnits.length === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-[#5B6472]">Todavía no hay {p.unitLabelPluralLower} cargadas.</p>
      ) : n === 0 ? (
        <div className="px-6 py-12 flex flex-col items-center gap-3 text-center">
          <span className="text-base font-bold">No hay {p.unitLabelPluralLower} con estos filtros</span>
          <button type="button" onClick={clearSheet} className="h-11 px-[18px] rounded-xl border border-gray-900 text-sm font-semibold">
            Limpiar filtros
          </button>
        </div>
      ) : (
        // Al cambiar filtro u orden, la lista nueva entra con un fundido
        // (solo opacidad: un transform rompería los encabezados sticky).
        <motion.div
          key={`${p.categoryFilter}|${p.orden}|${floorFilter}|${n}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.22, ease: 'easeOut' }}
        >
        {groups.map(g => (
          <section key={g.key}>
            {g.name && (
              <h2 className="sticky top-16 z-[1] m-0 h-9 flex items-center px-4 bg-[#F7F8F9] border-b border-[#ECEEF0] text-[13px] font-bold text-[#3F4753]">
                {g.name}
              </h2>
            )}
            {g.rows.map(u => <Row key={u.id} unit={u} p={p} />)}
          </section>
        ))}
        </motion.div>
      )}

      {p.showLeads && (
        <button
          type="button"
          onClick={() => p.onContact()}
          className="mx-4 my-6 w-[calc(100%-2rem)] min-h-[68px] px-4 rounded-[14px] bg-[#F4F5F6] flex items-center gap-3 text-left"
        >
          <span className="flex-1 flex flex-col gap-0.5">
            <span className="text-[15px] font-bold">¿No encontrás lo que buscás?</span>
            <span className="text-[13px] text-[#5B6472]">Hablá con un asesor</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      )}

      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.button
              key="scrim"
              type="button"
              aria-label="Cerrar filtros"
              onClick={() => setSheetOpen(false)}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={BACKDROP}
              className="fixed inset-0 z-[70] bg-[rgba(17,24,39,0.55)] backdrop-blur-[3px]"
            />
            <motion.section
              key="sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="t-filtros"
              style={sheetDrag.reduced ? undefined : { y: sheetDrag.y }}
              {...sheetDrag.sheetMotion}
              className="fixed inset-x-0 bottom-0 z-[71] max-h-[85dvh] flex flex-col bg-white rounded-t-[20px] shadow-[0_-12px_40px_rgba(17,24,39,0.2)]"
            >
              {/* Manija y título: arrastrando desde acá hacia abajo se cierra. */}
              <div {...sheetDrag.handlers} className="touch-none cursor-grab active:cursor-grabbing">
              <div className="flex justify-center pt-2"><span className="w-10 h-1 rounded-full bg-[#D5D9DE]" /></div>
              <div className="flex items-center justify-between pl-4 pr-2 pt-1.5 pb-2">
                <h2 id="t-filtros" className="m-0 text-lg font-bold">Ordenar y filtrar</h2>
                <button type="button" onClick={() => setSheetOpen(false)} onPointerDown={e => e.stopPropagation()} aria-label="Cerrar" className="w-11 h-11 rounded-xl flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-1 pb-4 grid content-start gap-[22px]">
                <OptGroup title="Ordenar por" cols={2} options={p.sortOptions} value={p.orden} onPick={p.setOrden} />
                {p.showStatus && (
                  <OptGroup
                    title="Estado"
                    cols={2}
                    options={[{ value: 'all', label: 'Todos' }, ...(['available', 'reserved', 'sold'] as const).map(s => ({ value: s, label: STATUS_SHORT[s] }))]}
                    value={p.statusFilter}
                    onPick={p.setStatusFilter}
                  />
                )}
                {p.hasMultipleBuildings && (
                  <OptGroup
                    title="Torre"
                    cols={2}
                    options={[{ value: 'all', label: 'Todas' }, ...p.buildings.map(b => ({ value: b.id, label: b.name }))]}
                    value={p.buildingFilter}
                    onPick={p.setBuildingFilter}
                  />
                )}
                {showFloorFilter && (
                  <OptGroup
                    title="Piso"
                    cols={4}
                    options={[{ value: 'all' as const, label: 'Todos' }, ...floors.map(f => ({ value: f, label: floorShort(f) }))]}
                    value={floorFilter}
                    onPick={setFloorFilter}
                  />
                )}
                {p.typeOptions.length > 1 && (
                  <OptGroup
                    title="Tipología"
                    cols={2}
                    options={[{ value: 'all' as const, label: 'Todas' }, ...p.typeOptions.map(t => ({ value: t, label: unitTypeLabel(t) }))]}
                    value={p.typeFilter}
                    onPick={p.setTypeFilter}
                  />
                )}
                {priceCuts.length > 0 && (
                  <OptGroup
                    title="Precio"
                    cols={2}
                    options={[{ value: 0, label: 'Cualquiera' }, ...priceCuts.map(c => ({ value: c, label: `Hasta ${formatPrice(c)}` }))]}
                    value={priceCuts.includes(p.maxPrice) ? p.maxPrice : 0}
                    onPick={p.setMaxPrice}
                  />
                )}
                {areaCuts.length > 0 && (
                  <OptGroup
                    title="Superficie"
                    cols={2}
                    options={[{ value: 0, label: 'Cualquiera' }, ...areaCuts.map(c => ({ value: c, label: `Desde ${c} m²` }))]}
                    value={areaCuts.includes(p.minArea) ? p.minArea : 0}
                    onPick={p.setMinArea}
                  />
                )}
                {(p.feats.length > 0 || p.favoritesCount > 0) && (
                  <div className="grid gap-2.5">
                    <span className="text-sm font-bold">Con</span>
                    <div className="flex flex-wrap gap-2">
                      {p.feats.map(f => {
                        const on = p.selectedFeats.includes(f.key);
                        return (
                          <Pill key={f.key} on={on} onClick={() => p.setSelectedFeats(on ? p.selectedFeats.filter(x => x !== f.key) : [...p.selectedFeats, f.key])}>
                            {f.label}
                          </Pill>
                        );
                      })}
                      {p.favoritesCount > 0 && (
                        <Pill on={p.onlyFavs} onClick={() => p.setOnlyFavs(!p.onlyFavs)}>Solo favoritas · {p.favoritesCount}</Pill>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div
                className="shrink-0 grid grid-cols-[1fr_2fr] gap-2 px-4 pt-3 border-t border-[#ECEEF0]"
                style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
              >
                <button type="button" onClick={clearSheet} className="h-12 rounded-xl border border-[#D5D9DE] text-[15px] font-semibold">Limpiar</button>
                <button type="button" onClick={() => setSheetOpen(false)} className="h-12 rounded-xl bg-gray-900 text-white text-[15px] font-semibold">
                  {n === 1 ? 'Ver 1 unidad' : `Ver ${n} ${p.unitLabelPluralLower}`}
                </button>
              </div>
            </motion.section>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({ unit: u, p }: { unit: Unit; p: MobileUnitsListProps }) {
  const img = u.interiorImageUrl || u.galleryImages?.[0];
  const sold = p.showStatus && u.status === 'sold';
  const cat = unitCategory(u);
  const kind = p.unitIsLand ? '' : u.modelName || (unitIsDwelling(u) ? unitTypeLabel(u.type) : '');
  const meta = [
    u.totalArea > 0 ? `${String(u.totalArea).replace('.', ',')} m²` : null,
    p.hasFloorStep ? floorName(u.floor) : null,
    p.hasMultipleBuildings && !p.hasFloorStep ? p.buildingName(u.buildingId) : null,
  ].filter(Boolean).join(' · ');
  const right = p.showPrice ? (sold ? 'Vendida' : u.price != null ? formatPrice(u.price, u.currency) : 'Consultar') : null;
  const statusNote = p.showStatus && u.status !== 'available' && !(sold && p.showPrice) ? STATUS_SHORT[u.status] ?? getStatusLabel(u.status) : null;
  return (
    <Link
      href={p.unitHref(u)}
      className={`min-h-[76px] flex items-center gap-3 pl-4 pr-3 border-b border-[#ECEEF0] text-gray-900 transition-colors duration-150 active:bg-[#F4F5F6] ${sold ? 'opacity-60' : ''}`}
    >
      <span className="relative w-14 h-14 shrink-0 rounded-[10px] overflow-hidden bg-[#F4F5F6]">
        {img && <Image src={img} alt="" fill sizes="56px" className="object-cover" />}
      </span>
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[15px] font-bold truncate">
          {u.name}
          {kind && <span className="font-medium text-[13px] text-[#5B6472]"> · {kind}</span>}
        </span>
        <span className="flex items-center gap-1.5 min-w-0">
          {CATEGORY_SHORT[cat] && (
            <span
              className="shrink-0 px-1.5 py-px rounded-md text-[11px] font-bold"
              style={{ color: CATEGORY_INK[cat], background: `${CATEGORY_COLOR[cat]}1f` }}
            >
              {CATEGORY_SHORT[cat]}
            </span>
          )}
          {meta && <span className="text-[13px] text-[#5B6472] truncate">{meta}</span>}
        </span>
      </span>
      {(right || statusNote) && (
        <span className="shrink-0 flex flex-col items-end gap-0.5">
          {right && <span className="text-[15px] font-bold tabular-nums">{right}</span>}
          {statusNote && <span className="text-xs font-semibold" style={{ color: STATUS_INK[u.status] }}>{statusNote}</span>}
        </span>
      )}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9AA1AB" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0"><path d="M9 18l6-6-6-6" /></svg>
    </Link>
  );
}

function OptGroup<T extends string | number>({ title, cols, options, value, onPick }: {
  title: string;
  cols: number;
  options: Option<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="grid gap-2.5">
      <span className="text-sm font-bold">{title}</span>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map(o => (
          <Pill key={String(o.value)} on={o.value === value} onClick={() => onPick(o.value)} block>{o.label}</Pill>
        ))}
      </div>
    </div>
  );
}

function Pill({ on, onClick, block, children }: { on: boolean; onClick: () => void; block?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`h-11 ${block ? 'min-w-0' : 'px-3.5'} rounded-[10px] border text-sm font-semibold truncate transition-colors ${
        on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-[#D5D9DE] text-gray-900'
      }`}
    >
      {children}
    </button>
  );
}
