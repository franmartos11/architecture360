'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { downloadCsv } from '@/lib/csv';
import { priceChangeFromInput, pluralize } from '@/lib/units';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement, buildingAgreement } from '@/lib/project-types';
import { STATUS_STYLE, money } from '@/lib/panel-comercial-style';
import { PageHeader, btnSecondary } from '@/components/admin/panel-ui';

// building_name/floor_number no son columnas reales de `units` — las agrega
// /api/admin/units enriqueciendo cada fila para el listado global.
type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'status' | 'price' | 'currency'> & {
  building_name: string | null;
  floor_number: number | null;
};

export default function AdminInventory() {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<UnitStatus>('available');
  const [bulkPriceMode, setBulkPriceMode] = useState<'pct' | 'fixed'>('pct');
  const [bulkPriceSign, setBulkPriceSign] = useState<'increase' | 'decrease'>('increase');
  const [bulkPriceAmount, setBulkPriceAmount] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const bAgree = buildingAgreement(typeConfig);
  const columnCount = 4 + (typeConfig.showStatus ? 1 : 0) + (typeConfig.showPrice ? 2 : 0);
  const currency = units[0]?.currency || 'USD';
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();

  const buildingNames = useMemo(
    () => Array.from(new Set(units.map(u => u.building_name).filter((n): n is string => !!n))).sort(),
    [units]
  );
  const typesPresent = useMemo(
    () => Array.from(new Set(units.map(u => u.type))).sort(),
    [units]
  );

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter(u => {
      const matchesSearch = !q || u.code.toLowerCase().includes(q) || (u.model_name ?? '').toLowerCase().includes(q);
      const matchesBuilding = buildingFilter === 'all' || u.building_name === buildingFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesType = typeFilter === 'all' || u.type === typeFilter;
      return matchesSearch && matchesBuilding && matchesStatus && matchesType;
    });
  }, [units, search, buildingFilter, statusFilter, typeFilter]);

  const fetchUnits = () => {
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => {
        if (!res.ok) throw new Error('Request failed');
        return res.json();
      })
      .then(data => {
        setUnits(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUnits();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const handleUpdateUnit = async (id: string, updates: Partial<Pick<UnitRow, 'status' | 'price'>>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/admin/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
        toast('Guardado.');
      } else {
        toast(`Error al actualizar ${hasFloorStep ? 'la unidad' : `${uAgree.el} ${unitLabelLower}`}.`, 'error');
      }
    } catch (error) {
      console.error(error);
      toast('Error al actualizar la unidad.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev);
        filteredUnits.forEach(u => next.delete(u.id));
        return next;
      }
      const next = new Set(prev);
      filteredUnits.forEach(u => next.add(u.id));
      return next;
    });
  };

  const handleBulkStatus = async () => {
    setBulkWorking(true);
    const ids = Array.from(selectedIds);
    // Un solo request para todo el lote — antes era un fetch por unidad en
    // paralelo, y con más de 120 seleccionadas el límite de escrituras del
    // admin (proxy.ts) cortaba el resto en silencio: el toast decía
    // "actualizado" igual, sin que quedara rastro de qué no se guardó.
    const res = await fetch(withActiveProject('/api/admin/units/bulk', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: bulkStatus }),
    });
    setBulkWorking(false);
    if (!res.ok) { toast('No se pudo actualizar el estado.', 'error'); return; }
    const { updated, skipped } = await res.json() as { updated: string[]; skipped: { id: string; reason: string }[] };
    setUnits(prev => prev.map(u => (updated.includes(u.id) ? { ...u, status: bulkStatus } : u)));
    toast(
      `Estado actualizado en ${updated.length} ${updated.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}.${skipped.length > 0 ? ` ${skipped.length} sin poder actualizar.` : ''}`,
      skipped.length > 0 ? 'error' : undefined
    );
  };

  const handleBulkPrice = async () => {
    const amount = Number(bulkPriceAmount);
    if (!bulkPriceAmount || Number.isNaN(amount) || amount <= 0) { toast('Ingresá un monto válido.', 'error'); return; }
    setBulkWorking(true);
    // El delta de cada unidad lo calcula el servidor a partir del precio que
    // hay en la base en este momento, no del que el navegador tiene en
    // pantalla (que puede haber quedado viejo si alguien más editó esa
    // unidad mientras tanto).
    const res = await fetch(withActiveProject('/api/admin/units/bulk', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: Array.from(selectedIds),
        priceAdjustment: { mode: bulkPriceMode, sign: bulkPriceSign, amount },
      }),
    });
    setBulkWorking(false);
    if (!res.ok) { toast('No se pudo ajustar el precio.', 'error'); return; }
    const { updated, skipped } = await res.json() as { updated: { id: string; price: number }[]; skipped: { id: string; reason: string }[] };
    const priceById = new Map(updated.map(u => [u.id, u.price]));
    setUnits(prev => prev.map(u => (priceById.has(u.id) ? { ...u, price: priceById.get(u.id)! } : u)));
    const skippedNoPrice = skipped.filter(s => s.reason === 'Sin precio cargado').length;
    toast(`Precio actualizado en ${updated.length} ${updated.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}.${skippedNoPrice > 0 ? ` ${skippedNoPrice} sin precio cargado, omitida${skippedNoPrice === 1 ? '' : 's'}.` : ''}`);
  };

  const handleExportCsv = () => {
    const header = ['code', 'modelName', 'type', 'totalArea', 'buildingName', 'floorNumber', 'status', 'price', 'currency'];
    const rows = filteredUnits.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''),
      u.building_name ?? '', String(u.floor_number ?? ''), u.status, u.price != null ? String(u.price) : '', u.currency || 'USD',
    ]);
    downloadCsv(`${hasFloorStep ? 'inventario' : `${pluralize(unitLabelLower)}`}.csv`, [header, ...rows]);
  };

  if (loading) return <LoadingSpinner text={`Cargando ${hasFloorStep ? 'inventario' : `${pluralize(unitLabelLower)}`}...`} tone="light" />;
  if (error) return <ErrorState message={`No se pudo cargar ${hasFloorStep ? 'el inventario' : `${uAgree.el === 'la' ? 'las' : 'los'} ${pluralize(unitLabelLower)}`}.`} onRetry={fetchUnits} />;

  const counts = {
    available: units.filter(u => u.status === 'available').length,
    reserved: units.filter(u => u.status === 'reserved').length,
    sold: units.filter(u => u.status === 'sold').length,
  };
  const floorsCount = new Set(units.map(u => `${u.building_name}|${u.floor_number}`)).size;
  const title = hasFloorStep ? 'Inventario' : `${pluralize(unitLabel)}`;

  // Tipologías = model_name (lo que arma la carga guiada: "Tipología A").
  const typologies = Array.from(
    units.reduce((m, u) => {
      if (!u.model_name) return m;
      const t = m.get(u.model_name) ?? { name: u.model_name, type: u.type, area: u.total_area, count: 0 };
      t.count += 1;
      m.set(u.model_name, t);
      return m;
    }, new Map<string, { name: string; type: string; area: number | null; count: number }>()).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  // Corte del edificio elegido (o del único): un piso por fila, una celda por unidad, color por estado.
  const corteBuilding = buildingFilter !== 'all' ? buildingFilter : (buildingNames.length === 1 ? buildingNames[0] : null);
  const corteFloors = hasFloorStep && corteBuilding
    ? Array.from(units.filter(u => u.building_name === corteBuilding).reduce((m, u) => {
        const key = u.floor_number ?? 0;
        m.set(key, [...(m.get(key) ?? []), u].sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true })));
        return m;
      }, new Map<number, UnitRow[]>()).entries()).sort((a, b) => b[0] - a[0])
    : [];

  const statusPill: Record<UnitStatus, string> = {
    available: 'bg-brand-50 text-brand-800 border-brand-200',
    reserved: 'bg-amber-100 text-amber-800 border-amber-200',
    sold: 'bg-gray-900 text-white border-gray-900',
  };
  const th = 'px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 whitespace-nowrap';
  const darkBtn = 'min-h-[36px] px-3 rounded-lg border border-[#3A3B38] text-[13px] font-semibold text-white hover:border-gray-500';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Estructura e inventario"
        title={title}
        description={
          <>
            {buildingNames.length > 1 && `${buildingNames.length} ${pluralize(buildingLabelLower)} · `}
            {hasFloorStep && floorsCount > 0 && `${floorsCount} pisos · `}
            {units.length} {units.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}
            {typeConfig.showStatus && units.length > 0 && <> — <b className="font-semibold text-gray-900">{counts.available} disponibles</b>, {counts.reserved} reservadas, {counts.sold} vendidas</>}
          </>
        }
        actions={
          <button type="button" onClick={handleExportCsv} disabled={filteredUnits.length === 0} className={btnSecondary}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
            Exportar CSV
          </button>
        }
      />

      <p className="m-0 -mt-3 text-[13px] text-gray-600 max-w-[720px]">
        {hasFloorStep
          ? 'Estados y precios de las unidades. Para cargar unidades nuevas o editar sus datos, entrá por Edificios → el piso correspondiente.'
          : hasUnitStep
          ? `Actualizá estados y precios de ${uAgree.el === 'la' ? 'las' : 'los'} ${pluralize(unitLabelLower)}. Para cargar ${pluralize(unitLabelLower)} ${uAgree.nuevo}s, entrá por ${pluralize(buildingLabel)} → la delimitación.`
          : `Actualizá estados y precios rápido, en lote. Para cargar el resto de los datos de ${bAgree.un} ${buildingLabelLower} ${bAgree.nuevo}, entrá por ${pluralize(buildingLabel)}.`}
      </p>

      {typologies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Tipologías <span className="font-normal text-gray-600">— tocá una para filtrar la tabla</span></h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(188px, 100%), 1fr))' }}>
            {typologies.map(t => {
              const on = typeFilter === t.type && search === t.name;
              const letter = t.name.replace(/^Tipolog[ií]a\s*/i, '').charAt(0).toUpperCase() || '·';
              return (
                <button key={t.name} type="button" aria-pressed={on}
                  onClick={() => { if (on) { setSearch(''); setTypeFilter('all'); } else { setSearch(t.name); setTypeFilter('all'); } }}
                  className={`text-left flex flex-col gap-2 p-3.5 rounded-[14px] bg-white transition-colors ${on ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center justify-center">{letter}</span>
                    <span className="text-xs text-gray-600">{t.count} {t.count === 1 ? unitLabelLower : pluralize(unitLabelLower)}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 truncate">{t.type || t.name}</span>
                    {t.area ? <span className="font-display text-[22px] leading-tight font-semibold text-gray-900">{t.area} m²</span> : <span className="text-xs text-gray-500">Sin superficie</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-x-4 gap-y-3 flex-wrap border-b border-gray-200">
          {buildingNames.length > 1 && (
            <div role="tablist" aria-label={pluralize(buildingLabel)} className="flex gap-1 overflow-x-auto -mb-px">
              {[{ value: 'all', label: hasFloorStep ? 'Todos' : 'Todas', count: units.length }, ...buildingNames.map(n => ({ value: n, label: n, count: units.filter(u => u.building_name === n).length }))].map(tab => (
                <button key={tab.value} type="button" role="tab" aria-selected={buildingFilter === tab.value} onClick={() => setBuildingFilter(tab.value)}
                  className={`min-h-[44px] px-3.5 text-sm whitespace-nowrap border-b-2 ${buildingFilter === tab.value ? 'border-gray-900 font-semibold text-gray-900' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
                  {tab.label} <span className="text-gray-500 font-normal">{tab.count}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2 flex-wrap pb-2.5 w-full sm:w-auto">
            <label className="flex-1 sm:flex-none flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white sm:w-[220px] focus-within:border-brand-700">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6A65" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Código o tipología" aria-label="Buscar por código o tipología"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-500" />
            </label>
            {typeConfig.showStatus && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as UnitStatus | 'all')} aria-label="Filtrar por estado"
                className="min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-900">
                <option value="all">Cualquier estado</option>
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </select>
            )}
            {typesPresent.length > 1 && (
              <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as UnitType | 'all')} aria-label="Filtrar por tipo"
                className="min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-900">
                <option value="all">Cualquier tipo</option>
                {typesPresent.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-5 flex-wrap items-start">
          {corteFloors.length > 0 && (
            <section aria-label={`Corte de ${corteBuilding}`} className="flex-[1_1_220px] md:max-w-[240px] min-w-0 rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600 truncate">Corte · {corteBuilding}</span>
              <div className="flex flex-col gap-1">
                {corteFloors.map(([floor, list]) => (
                  <div key={floor} className="flex items-center gap-1.5">
                    <span className="w-6 text-right text-[11px] text-gray-500 shrink-0">{floor === 0 ? 'PB' : floor}</span>
                    <div className="flex-1 flex gap-1">
                      {list.map(u => (
                        <button key={u.id} type="button" title={`${u.code} · ${STATUS_STYLE[u.status].label}`} aria-label={`${u.code}: ${STATUS_STYLE[u.status].label}`}
                          onClick={() => setSearch(u.code)}
                          className="flex-1 h-5 rounded-[4px] min-w-[10px]" style={{ background: CORTE_COLOR[u.status] }} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="h-1.5 rounded-sm bg-[#D6D1C7] ml-[30px]" aria-hidden="true" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                {(['available', 'reserved', 'sold'] as UnitStatus[]).map(st => (
                  <span key={st} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CORTE_COLOR[st] }} />{STATUS_STYLE[st].label}</span>
                ))}
              </div>
            </section>
          )}

          <section className="flex-[999_1_480px] min-w-0 rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="bg-gray-900 px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white whitespace-nowrap mr-1">{selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}</span>
                {typeConfig.showStatus && (
                  <span className="flex items-center gap-1.5">
                    <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as UnitStatus)} aria-label="Estado a aplicar"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="available">Disponible</option>
                      <option value="reserved">Reservado</option>
                      <option value="sold">Vendido</option>
                    </select>
                    <button type="button" disabled={bulkWorking} onClick={handleBulkStatus} className={`${darkBtn} disabled:opacity-50`}>Cambiar estado</button>
                  </span>
                )}
                {typeConfig.showPrice && (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <select value={bulkPriceSign} onChange={e => setBulkPriceSign(e.target.value as 'increase' | 'decrease')} aria-label="Subir o bajar"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="increase">Subir</option>
                      <option value="decrease">Bajar</option>
                    </select>
                    <input type="number" min={0} value={bulkPriceAmount} onChange={e => setBulkPriceAmount(e.target.value)} placeholder="Monto" aria-label="Monto del ajuste"
                      className="w-[84px] min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[13px] text-white outline-none placeholder:text-white/50" />
                    <select value={bulkPriceMode} onChange={e => setBulkPriceMode(e.target.value as 'pct' | 'fixed')} aria-label="Porcentaje o monto fijo"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="pct">%</option>
                      <option value="fixed">Monto fijo</option>
                    </select>
                    <button type="button" disabled={bulkWorking} onClick={handleBulkPrice} className={`${darkBtn} disabled:opacity-50`}>Ajustar precio</button>
                  </span>
                )}
                <button type="button" onClick={() => setSelectedIds(new Set())} aria-label="Deseleccionar todo"
                  className="ml-auto w-9 h-9 rounded-lg text-white/70 hover:text-white flex items-center justify-center">✕</button>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[760px]">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 w-[44px]">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-[#37463F]" aria-label="Seleccionar todas" />
                    </th>
                    <th className={th}>{hasFloorStep ? 'Unidad' : unitLabel}</th>
                    <th className={th}>{hasFloorStep ? 'Edificio · Piso' : buildingLabel}</th>
                    <th className={th}>Tipología</th>
                    {typeConfig.showStatus && <th className={`${th} w-[156px]`}>Estado</th>}
                    {typeConfig.showPrice && <th className={`${th} w-[150px]`}>Precio</th>}
                    {typeConfig.showPrice && <th className={`${th} w-24 text-right`}>{currency}/m²</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.map(unit => (
                    <tr key={unit.id} className={`border-b border-gray-100 ${selectedIds.has(unit.id) ? 'bg-brand-50' : 'bg-white'}`}>
                      <td className="px-4 py-2.5">
                        <input type="checkbox" checked={selectedIds.has(unit.id)} onChange={() => toggleSelected(unit.id)} className="w-4 h-4 accent-[#37463F]" aria-label={`Seleccionar ${unit.code}`} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{unit.code}</div>
                        <div className="text-xs text-gray-500 whitespace-nowrap">{unit.total_area ?? '—'} m² total</div>
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-700 whitespace-nowrap">
                        {unit.building_name ?? '—'}{hasFloorStep && <> · {unit.floor_number === 0 ? 'PB' : `Piso ${unit.floor_number ?? '—'}`}</>}
                      </td>
                      <td className="px-4 py-2.5 text-[13px] text-gray-700 whitespace-nowrap">{unit.model_name ?? <span className="text-gray-400">—</span>}</td>
                      {typeConfig.showStatus && (
                        <td className="px-4 py-2.5">
                          <select
                            value={unit.status}
                            disabled={savingId === unit.id}
                            aria-label={`Estado de ${unit.code}`}
                            onChange={(e) => handleUpdateUnit(unit.id, { status: e.target.value as UnitStatus })}
                            className={`w-full min-w-[128px] min-h-[36px] pl-3 pr-1.5 rounded-full border text-xs font-semibold outline-none cursor-pointer disabled:opacity-50 ${statusPill[unit.status]}`}
                          >
                            <option value="available">Disponible</option>
                            <option value="reserved">Reservado</option>
                            <option value="sold">Vendido</option>
                          </select>
                        </td>
                      )}
                      {typeConfig.showPrice && (
                        <td className="px-4 py-2.5">
                          <span className="flex items-center min-h-[36px] rounded-lg border border-gray-300 bg-white focus-within:border-brand-700 overflow-hidden">
                            <span className="pl-2.5 text-[11px] font-semibold text-gray-600">{unit.currency || 'USD'}</span>
                            <input
                              type="number"
                              defaultValue={unit.price ?? ''}
                              placeholder="Consultar"
                              disabled={savingId === unit.id}
                              aria-label={`Precio de ${unit.code}`}
                              onBlur={(e) => {
                                // Vacío = null ("Consultar"); un 0 tipeado a propósito se guarda como 0;
                                // texto inválido no pisa el precio existente (restaura el campo).
                                const change = priceChangeFromInput(e.target, unit.price);
                                if (change) handleUpdateUnit(unit.id, change);
                              }}
                              className="flex-1 min-w-0 h-[34px] px-2 text-[13px] font-medium text-gray-900 outline-none bg-transparent placeholder:text-gray-400"
                            />
                          </span>
                        </td>
                      )}
                      {typeConfig.showPrice && (
                        <td className={`px-4 py-2.5 text-xs text-right ${unit.price && unit.total_area ? 'text-gray-600' : 'text-amber-800'}`}>
                          {unit.price && unit.total_area ? money(unit.price / unit.total_area) : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                  {filteredUnits.length === 0 && (
                    <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-[13px] text-gray-500">
                      {units.length === 0
                        ? (hasFloorStep ? 'Todavía no hay unidades cargadas.' : `Todavía no hay ${pluralize(unitLabelLower)} ${uAgree.cargado}s.`)
                        : (hasFloorStep ? 'Ninguna unidad coincide con el filtro.' : `${uAgree.ningun === 'ninguna' ? 'Ninguna' : 'Ningún'} ${unitLabelLower} coincide con el filtro.`)}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredUnits.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-x-6 gap-y-1 flex-wrap text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{filteredUnits.length} {hasFloorStep ? 'unidades' : `${pluralize(unitLabelLower)}`} en la vista</span>
                {typeConfig.showStatus && (
                  <span>
                    {filteredUnits.filter(u => u.status === 'available').length} disponibles · {filteredUnits.filter(u => u.status === 'reserved').length} reservadas · {filteredUnits.filter(u => u.status === 'sold').length} vendidas
                  </span>
                )}
                {typeConfig.showPrice && (
                  <span className="sm:ml-auto">
                    <b className="font-semibold text-gray-900">{money(filteredUnits.reduce((sum, u) => sum + (u.price || 0), 0))}</b>
                    {(() => {
                      const totalArea = filteredUnits.reduce((sum, u) => sum + (u.total_area || 0), 0);
                      const totalVal = filteredUnits.reduce((sum, u) => sum + (u.price || 0), 0);
                      return totalArea ? ` · ${money(totalVal / totalArea)}/m²` : '';
                    })()}
                  </span>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// Colores del corte (diseño): disponible, reservada, vendida.
const CORTE_COLOR: Record<UnitStatus, string> = { available: '#9DB3A5', reserved: '#E3B567', sold: '#2B302D' };
