'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadCsv } from '@/lib/csv';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement, buildingAgreement } from '@/lib/project-types';
import { poppins, ACCENT, STATUS_STYLE, money, CHIP_CLASS, chipStyle } from '@/lib/panel-comercial-style';

// building_name/floor_number no son columnas reales de `units` — las agrega
// /api/admin/units enriqueciendo cada fila para el listado global.
type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'status' | 'price' | 'currency'> & {
  building_name: string | null;
  floor_number: number | null;
};

const DARK_BG = '#101828';

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
    fetch('/api/admin/units')
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
  }, []);

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
    const results = await Promise.all(ids.map(id =>
      fetch(`/api/admin/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: bulkStatus }),
      }).then(r => r.ok)
    ));
    setBulkWorking(false);
    const okIds = ids.filter((_, i) => results[i]);
    setUnits(prev => prev.map(u => (okIds.includes(u.id) ? { ...u, status: bulkStatus } : u)));
    toast(`Estado actualizado en ${okIds.length} ${unitLabelLower}${okIds.length === 1 ? '' : 's'}.`, okIds.length < ids.length ? 'error' : undefined);
  };

  const handleBulkPrice = async () => {
    const amount = Number(bulkPriceAmount);
    if (!bulkPriceAmount || Number.isNaN(amount) || amount <= 0) { toast('Ingresá un monto válido.', 'error'); return; }
    setBulkWorking(true);
    const targets = units.filter(u => selectedIds.has(u.id) && u.price != null);
    const results = await Promise.all(targets.map(u => {
      const delta = bulkPriceMode === 'pct' ? Math.round((u.price as number) * (amount / 100)) : amount;
      const newPrice = Math.max(0, bulkPriceSign === 'increase' ? (u.price as number) + delta : (u.price as number) - delta);
      return fetch(`/api/admin/units/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price: newPrice }),
      }).then(r => (r.ok ? newPrice : null));
    }));
    setBulkWorking(false);
    setUnits(prev => prev.map(u => {
      const idx = targets.findIndex(t => t.id === u.id);
      const result = idx >= 0 ? results[idx] : null;
      return result != null ? { ...u, price: result } : u;
    }));
    const updated = results.filter(r => r != null).length;
    const skippedNoPrice = selectedIds.size - targets.length;
    toast(`Precio actualizado en ${updated} ${unitLabelLower}${updated === 1 ? '' : 's'}.${skippedNoPrice > 0 ? ` ${skippedNoPrice} sin precio cargado, omitida${skippedNoPrice === 1 ? '' : 's'}.` : ''}`);
  };

  const handleExportCsv = () => {
    const header = ['code', 'modelName', 'type', 'totalArea', 'buildingName', 'floorNumber', 'status', 'price', 'currency'];
    const rows = filteredUnits.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''),
      u.building_name ?? '', String(u.floor_number ?? ''), u.status, u.price != null ? String(u.price) : '', u.currency || 'USD',
    ]);
    downloadCsv(`${hasFloorStep ? 'inventario' : `${unitLabelLower}s`}.csv`, [header, ...rows]);
  };

  if (loading) return <LoadingSpinner text={`Cargando ${hasFloorStep ? 'inventario' : `${unitLabelLower}s`}...`} tone="light" />;
  if (error) return <ErrorState message={`No se pudo cargar ${hasFloorStep ? 'el inventario' : `los ${unitLabelLower}s`}.`} onRetry={fetchUnits} />;

  return (
    <div className={`${poppins.className} flex flex-col gap-3.5`}>
      <div>
        <div className="text-[22px] font-semibold leading-tight text-[#101828]">{hasFloorStep ? 'Inventario' : `${unitLabel}s`}</div>
        <p className="text-xs leading-relaxed mt-[5px]" style={{ color: 'rgba(16,24,40,.55)' }}>
          {hasFloorStep
            ? 'Estados y precios de las unidades. Para cargar deptos nuevos o editar sus specs, entrá por Edificios → el piso correspondiente.'
            : hasUnitStep
            ? `Actualizá estados y precios de ${uAgree.el === 'la' ? 'las' : 'los'} ${unitLabelLower}s. Para cargar ${unitLabelLower}s ${uAgree.nuevo}s, entrá por ${buildingLabel}s → la delimitación.`
            : `Actualizá estados y precios rápido, en lote. Para cargar el resto de los datos de ${bAgree.un} ${buildingLabelLower} ${bAgree.nuevo}, entrá por ${buildingLabel}s.`}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código o modelo..."
          className="flex-1 min-w-[200px] h-9 px-3 rounded-[9px] text-[12.5px] outline-none transition-all"
          style={{ border: '1px solid rgba(16,24,40,.14)', background: '#fff', color: '#101828' }}
        />
        {buildingNames.length > 1 && (
          <div className="relative">
            <select
              value={buildingFilter}
              onChange={e => setBuildingFilter(e.target.value)}
              className={`${CHIP_CLASS} appearance-none pr-7`}
              style={chipStyle(buildingFilter !== 'all')}
            >
              <option value="all">{hasFloorStep ? 'Todos los edificios' : `Todas las ${buildingLabelLower}s`}</option>
              {buildingNames.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'rgba(16,24,40,.4)' }}>▾</span>
          </div>
        )}
        {typeConfig.showStatus && (
          <div className="relative">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as UnitStatus | 'all')}
              className={`${CHIP_CLASS} appearance-none pr-7`}
              style={chipStyle(statusFilter !== 'all')}
            >
              <option value="all">Cualquier estado</option>
              <option value="available">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="sold">Vendido</option>
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'rgba(16,24,40,.4)' }}>▾</span>
          </div>
        )}
        {typesPresent.length > 1 && (
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value as UnitType | 'all')}
              className={`${CHIP_CLASS} appearance-none pr-7`}
              style={chipStyle(typeFilter !== 'all')}
            >
              <option value="all">Cualquier tipología</option>
              {typesPresent.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px]" style={{ color: 'rgba(16,24,40,.4)' }}>▾</span>
          </div>
        )}
        <span className="text-[11.5px] whitespace-nowrap" style={{ color: 'rgba(16,24,40,.45)' }}>{filteredUnits.length} de {units.length}</span>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredUnits.length === 0}
          className="h-9 px-[13px] flex items-center rounded-[9px] text-[11.5px] font-medium transition-colors disabled:opacity-40"
          style={{ border: '1px solid rgba(16,24,40,.14)', background: '#fff', color: '#101828' }}
        >
          Exportar CSV
        </button>
      </div>

      {selectedIds.size > 0 && (
        <div className="rounded-[11px] p-[11px_14px] flex flex-wrap items-center gap-2.5" style={{ background: DARK_BG }}>
          <span className="text-[11.5px] font-medium text-white whitespace-nowrap">{selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}</span>

          {typeConfig.showStatus && (
            <div className="flex items-center gap-2">
              <div
                onClick={() => setBulkStatus(s => s === 'available' ? 'reserved' : s === 'reserved' ? 'sold' : 'available')}
                className="h-[30px] px-[11px] flex items-center rounded-[7px] text-[11px] font-medium text-white cursor-pointer"
                style={{ border: '1px solid rgba(255,255,255,.22)' }}
              >
                Estado: {STATUS_STYLE[bulkStatus].label} ▾
              </div>
              <button type="button" disabled={bulkWorking} onClick={handleBulkStatus} className="h-[30px] px-[11px] flex items-center rounded-[7px] text-[11px] font-medium bg-white text-[#101828] disabled:opacity-50">
                Aplicar estado
              </button>
            </div>
          )}

          {typeConfig.showPrice && (
            <div className="flex items-center gap-1.5">
              <div className="w-px h-[22px]" style={{ background: 'rgba(255,255,255,.18)' }} />
              <div
                onClick={() => setBulkPriceSign(s => s === 'increase' ? 'decrease' : 'increase')}
                className="h-[30px] px-[11px] flex items-center rounded-[7px] text-[11px] font-medium text-white cursor-pointer"
                style={{ border: '1px solid rgba(255,255,255,.22)' }}
              >
                {bulkPriceSign === 'increase' ? 'Subir' : 'Bajar'}
              </div>
              <input
                type="number" min={0} value={bulkPriceAmount} onChange={e => setBulkPriceAmount(e.target.value)}
                placeholder="Monto"
                className="w-[82px] h-[30px] px-2.5 rounded-[7px] text-[11.5px] text-white outline-none placeholder:text-white/50"
                style={{ background: 'rgba(255,255,255,.12)', border: 0 }}
              />
              <div
                onClick={() => setBulkPriceMode(m => m === 'pct' ? 'fixed' : 'pct')}
                className="h-[30px] px-[11px] flex items-center rounded-[7px] text-[11px] font-medium text-white cursor-pointer whitespace-nowrap"
                style={{ border: '1px solid rgba(255,255,255,.22)' }}
              >
                {bulkPriceMode === 'pct' ? '%' : 'Monto fijo'}
              </div>
              <button type="button" disabled={bulkWorking} onClick={handleBulkPrice} className="h-[30px] px-[11px] flex items-center rounded-[7px] text-[11px] font-medium bg-white text-[#101828] disabled:opacity-50 whitespace-nowrap">
                Aplicar precio
              </button>
            </div>
          )}

          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-[11px]" style={{ color: 'rgba(255,255,255,.6)' }}>
            Deseleccionar todo
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse" style={{ minWidth: 900 }}>
            <thead>
              <tr style={{ background: '#fbfcfd', borderBottom: '1px solid rgba(16,24,40,.08)' }}>
                <th className="px-4 py-3 w-[30px]">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="rounded" style={{ accentColor: ACCENT }} aria-label="Seleccionar todas" />
                </th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>{hasFloorStep ? 'Unidad' : unitLabel}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase w-[150px]" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>{hasFloorStep ? 'Edificio / Piso' : buildingLabel}</th>
                <th className="px-4 py-3 text-[10px] font-semibold uppercase w-[168px]" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>Tipología</th>
                {typeConfig.showStatus && <th className="px-4 py-3 text-[10px] font-semibold uppercase w-[132px]" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>Estado</th>}
                {typeConfig.showPrice && <th className="px-4 py-3 text-[10px] font-semibold uppercase w-[168px]" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>Precio</th>}
                {typeConfig.showPrice && <th className="px-4 py-3 text-[10px] font-semibold uppercase w-24 text-right" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.06em' }}>{currency}/m²</th>}
              </tr>
            </thead>
            <tbody>
              {filteredUnits.map(unit => {
                const status = STATUS_STYLE[unit.status];
                return (
                <tr key={unit.id} style={{ borderBottom: '1px solid rgba(16,24,40,.06)', background: selectedIds.has(unit.id) ? '#f4f7f3' : '#fff' }}>
                  <td className="px-4 py-3">
                    <input type="checkbox" checked={selectedIds.has(unit.id)} onChange={() => toggleSelected(unit.id)} className="rounded" style={{ accentColor: ACCENT }} aria-label={`Seleccionar ${unit.code}`} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[12.5px] font-semibold text-[#101828]">{unit.code}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: 'rgba(16,24,40,.45)' }}>{unit.total_area ?? '—'} m² total</div>
                  </td>
                  <td className="px-4 py-3 text-[11.5px]" style={{ color: 'rgba(16,24,40,.62)' }}>
                    <span>{unit.building_name ?? '—'}</span>
                    {hasFloorStep && <>{'  ·  Planta '}{unit.floor_number ?? '—'}</>}
                  </td>
                  <td className="px-4 py-3 text-[11px] uppercase" style={{ color: 'rgba(16,24,40,.62)', letterSpacing: '.04em' }}>
                    {unit.model_name}
                  </td>
                  {typeConfig.showStatus && (
                    <td className="px-4 py-3">
                      <div className="relative">
                        <select
                          value={unit.status}
                          disabled={savingId === unit.id}
                          onChange={(e) => handleUpdateUnit(unit.id, { status: e.target.value as 'available' | 'reserved' | 'sold' })}
                          className="w-full h-[33px] pl-[11px] pr-6 rounded-lg text-[11.5px] font-medium outline-none appearance-none cursor-pointer disabled:opacity-50"
                          style={{ color: status.color, background: status.bg, border: `1px solid ${status.border}` }}
                        >
                          <option value="available">Disponible</option>
                          <option value="reserved">Reservado</option>
                          <option value="sold">Vendido</option>
                        </select>
                        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] opacity-50">▾</span>
                      </div>
                    </td>
                  )}
                  {typeConfig.showPrice && (
                    <td className="px-4 py-3">
                      <div className="relative">
                        <span className="absolute left-[11px] top-1/2 -translate-y-1/2 text-[11.5px] font-medium" style={{ color: 'rgba(16,24,40,.4)' }}>$</span>
                        <input
                          type="number"
                          defaultValue={unit.price || 0}
                          disabled={savingId === unit.id}
                          onBlur={(e) => {
                            const newPrice = Number(e.target.value);
                            if (newPrice !== unit.price) {
                              handleUpdateUnit(unit.id, { price: newPrice });
                            }
                          }}
                          className="w-full h-[33px] pl-6 pr-[42px] rounded-lg text-[12px] font-medium outline-none transition-all"
                          style={{ border: '1px solid rgba(16,24,40,.13)', background: '#fff', color: '#101828' }}
                        />
                        <span className="absolute right-[11px] top-1/2 -translate-y-1/2 text-[9.5px] font-medium" style={{ color: 'rgba(16,24,40,.38)' }}>{unit.currency || 'USD'}</span>
                      </div>
                    </td>
                  )}
                  {typeConfig.showPrice && (
                    <td className="px-4 py-3 text-[11.5px] text-right" style={{ color: unit.price && unit.total_area ? 'rgba(16,24,40,.55)' : '#a06a12' }}>
                      {unit.price && unit.total_area ? money(unit.price / unit.total_area) : '—'}
                    </td>
                  )}
                </tr>
              );})}
              {filteredUnits.length === 0 && (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-[12px]" style={{ color: 'rgba(16,24,40,.4)' }}>
                  {units.length === 0
                    ? (hasFloorStep ? 'Todavía no hay unidades cargadas.' : `Todavía no hay ${unitLabelLower}s ${uAgree.cargado}s.`)
                    : (hasFloorStep ? 'Ninguna unidad coincide con el filtro.' : `${uAgree.ningun === 'ninguna' ? 'Ninguna' : 'Ningún'} ${unitLabelLower} coincide con el filtro.`)}
                </td></tr>
              )}
            </tbody>
            {filteredUnits.length > 0 && (
              <tfoot>
                <tr style={{ background: '#fbfcfd', borderTop: '1px solid rgba(16,24,40,.08)' }}>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-[11.5px] font-medium" style={{ color: 'rgba(16,24,40,.6)' }}>{filteredUnits.length} {hasFloorStep ? 'unidades' : `${unitLabelLower}s`} filtrada{filteredUnits.length === 1 ? '' : 's'}</td>
                  <td colSpan={typeConfig.showStatus ? 2 : 1} className="px-4 py-3 text-[11.5px]" style={{ color: 'rgba(16,24,40,.5)' }}>
                    {typeConfig.showStatus && (
                      <>
                        {filteredUnits.filter(u => u.status === 'available').length} disponibles · {filteredUnits.filter(u => u.status === 'reserved').length} reservadas · {filteredUnits.filter(u => u.status === 'sold').length} vendidas
                      </>
                    )}
                  </td>
                  {typeConfig.showPrice && (
                    <>
                      <td className="px-4 py-3 text-[13px] font-semibold text-[#101828]">
                        {money(filteredUnits.reduce((s, u) => s + (u.price || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-[11.5px] text-right" style={{ color: 'rgba(16,24,40,.5)' }}>
                        {(() => {
                          const totalArea = filteredUnits.reduce((s, u) => s + (u.total_area || 0), 0);
                          const totalVal = filteredUnits.reduce((s, u) => s + (u.price || 0), 0);
                          return totalArea ? `${money(totalVal / totalArea)}/m²` : '—';
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
