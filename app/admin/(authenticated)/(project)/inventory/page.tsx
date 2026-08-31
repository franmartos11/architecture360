'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { downloadCsv } from '@/lib/csv';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement, buildingAgreement } from '@/lib/project-types';

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
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const bAgree = buildingAgreement(typeConfig);
  const columnCount = 4 + (typeConfig.showStatus ? 1 : 0) + (typeConfig.showPrice ? 1 : 0);
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
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{hasFloorStep ? 'Inventario' : `${unitLabel}s`}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {hasFloorStep
              ? 'Actualizá estados y precios de las unidades. Para cargar deptos nuevos o editar sus specs, entrá por Edificios → el piso correspondiente.'
              : hasUnitStep
              ? `Actualizá estados y precios de ${uAgree.el === 'la' ? 'las' : 'los'} ${unitLabelLower}s. Para cargar ${unitLabelLower}s ${uAgree.nuevo}s, entrá por ${buildingLabel}s → la delimitación.`
              : `Actualizá estados y precios rápido, en lote. Para cargar el resto de los datos de ${bAgree.un} ${buildingLabelLower} ${bAgree.nuevo}, entrá por ${buildingLabel}s.`}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por código o modelo..."
          className="flex-1 min-w-[200px] text-sm rounded-lg px-3 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
        />
        {buildingNames.length > 1 && (
          <select
            value={buildingFilter}
            onChange={e => setBuildingFilter(e.target.value)}
            className="text-sm rounded-lg px-3 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
          >
            <option value="all">{hasFloorStep ? 'Todos los edificios' : `Todas las ${buildingLabelLower}s`}</option>
            {buildingNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
        {typeConfig.showStatus && (
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as UnitStatus | 'all')}
            className="text-sm rounded-lg px-3 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
          >
            <option value="all">Cualquier estado</option>
            <option value="available">Disponible</option>
            <option value="reserved">Reservado</option>
            <option value="sold">Vendido</option>
          </select>
        )}
        {typesPresent.length > 1 && (
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as UnitType | 'all')}
            className="text-sm rounded-lg px-3 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
          >
            <option value="all">Cualquier tipología</option>
            {typesPresent.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <span className="text-sm text-gray-400 whitespace-nowrap">{filteredUnits.length} de {units.length}</span>
        <Button type="button" variant="secondary" size="sm" onClick={handleExportCsv} disabled={filteredUnits.length === 0}>
          Exportar CSV
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 mb-4 flex flex-wrap items-center gap-3">
          <span className="text-sm text-white font-medium whitespace-nowrap">{selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}</span>

          {typeConfig.showStatus && (
            <div className="flex items-center gap-2">
              <select
                value={bulkStatus}
                onChange={e => setBulkStatus(e.target.value as UnitStatus)}
                className="text-sm rounded-lg px-2 py-1.5 border-0 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </select>
              <Button type="button" size="sm" variant="secondary" disabled={bulkWorking} onClick={handleBulkStatus}>
                Aplicar estado
              </Button>
            </div>
          )}

          {typeConfig.showPrice && (
            <div className="flex items-center gap-2">
              <select
                value={bulkPriceSign}
                onChange={e => setBulkPriceSign(e.target.value as 'increase' | 'decrease')}
                className="text-sm rounded-lg px-2 py-1.5 border-0 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="increase">Subir</option>
                <option value="decrease">Bajar</option>
              </select>
              <input
                type="number" min={0} value={bulkPriceAmount} onChange={e => setBulkPriceAmount(e.target.value)}
                placeholder="Monto" className="w-24 text-sm rounded-lg px-2 py-1.5 border-0 focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <select
                value={bulkPriceMode}
                onChange={e => setBulkPriceMode(e.target.value as 'pct' | 'fixed')}
                className="text-sm rounded-lg px-2 py-1.5 border-0 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="pct">%</option>
                <option value="fixed">Monto fijo</option>
              </select>
              <Button type="button" size="sm" variant="secondary" disabled={bulkWorking} onClick={handleBulkPrice}>
                Aplicar precio
              </Button>
            </div>
          )}

          <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-sm text-gray-400 hover:text-white">
            Deseleccionar todo
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-4 py-4 w-10">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" aria-label="Seleccionar todas" />
                </th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">{hasFloorStep ? 'Unidad' : unitLabel}</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">{hasFloorStep ? 'Edificio / Piso' : buildingLabel}</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Tipología</th>
                {typeConfig.showStatus && <th className="px-6 py-4 text-sm font-semibold text-gray-900 w-48">Estado</th>}
                {typeConfig.showPrice && <th className="px-6 py-4 text-sm font-semibold text-gray-900 w-48">Precio</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUnits.map(unit => (
                <tr key={unit.id} className={`hover:bg-gray-50/50 transition-colors ${selectedIds.has(unit.id) ? 'bg-brand-50/40' : ''}`}>
                  <td className="px-4 py-4">
                    <input type="checkbox" checked={selectedIds.has(unit.id)} onChange={() => toggleSelected(unit.id)} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" aria-label={`Seleccionar ${unit.code}`} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{unit.code}</div>
                    <div className="text-xs text-gray-500">{unit.total_area ?? '—'} m² total</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span>{unit.building_name ?? '—'}</span>
                    {hasFloorStep && (
                      <>
                        <span className="mx-2 text-gray-300">|</span>
                        Planta {unit.floor_number ?? '—'}
                      </>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 uppercase tracking-wide">
                    {unit.model_name}
                  </td>
                  {typeConfig.showStatus && (
                    <td className="px-6 py-4">
                      <select
                        value={unit.status}
                        disabled={savingId === unit.id}
                        onChange={(e) => handleUpdateUnit(unit.id, { status: e.target.value as 'available' | 'reserved' | 'sold' })}
                        className={`w-full text-sm font-medium rounded-lg px-3 py-2 border outline-none focus:ring-2 focus:ring-brand-500 transition-colors
                          ${unit.status === 'available' ? 'bg-green-50 text-green-700 border-green-200' : ''}
                          ${unit.status === 'reserved' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                          ${unit.status === 'sold' ? 'bg-red-50 text-red-700 border-red-200' : ''}
                          ${savingId === unit.id ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                      >
                        <option value="available">Disponible</option>
                        <option value="reserved">Reservado</option>
                        <option value="sold">Vendido</option>
                      </select>
                    </td>
                  )}
                  {typeConfig.showPrice && (
                    <td className="px-6 py-4">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
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
                          className="w-full text-sm font-medium rounded-lg pl-8 pr-14 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-gray-400">{unit.currency || 'USD'}</span>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {filteredUnits.length === 0 && (
                <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-gray-400">
                  {units.length === 0
                    ? (hasFloorStep ? 'Todavía no hay unidades cargadas.' : `Todavía no hay ${unitLabelLower}s ${uAgree.cargado}s.`)
                    : (hasFloorStep ? 'Ninguna unidad coincide con el filtro.' : `${uAgree.ningun === 'ninguna' ? 'Ninguna' : 'Ningún'} ${unitLabelLower} coincide con el filtro.`)}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
