'use client';

import { useState, useEffect, useMemo } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType } from '@/types';

// building_name/floor_number no son columnas reales de `units` — las agrega
// /api/admin/units enriqueciendo cada fila para el listado global.
type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'status' | 'price'> & {
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
  const toast = useToast();

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

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/admin/units');
      if (!res.ok) throw new Error('Request failed');
      const data = await res.json();
      setUnits(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

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
        toast('Error al actualizar la unidad.', 'error');
      }
    } catch (error) {
      console.error(error);
      toast('Error al actualizar la unidad.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <LoadingSpinner text="Cargando inventario..." tone="light" />;
  if (error) return <ErrorState message="No se pudo cargar el inventario." onRetry={fetchUnits} />;

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Inventario</h2>
          <p className="text-gray-500 mt-1">Actualizá estados y precios de las unidades. Para cargar deptos nuevos o editar sus specs, entrá por Edificios → el piso correspondiente.</p>
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
            <option value="all">Todos los edificios</option>
            {buildingNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        )}
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
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Unidad</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Edificio / Piso</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Tipología</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 w-48">Estado</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900 w-48">Precio (USD)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredUnits.map(unit => (
                <tr key={unit.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{unit.code}</div>
                    <div className="text-xs text-gray-500">{unit.total_area ?? '—'} m² total</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span>{unit.building_name ?? '—'}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    Planta {unit.floor_number ?? '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 uppercase tracking-wide">
                    {unit.model_name}
                  </td>
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
                        className="w-full text-sm font-medium rounded-lg pl-8 pr-3 py-2 border border-gray-200 focus:border-brand-500 focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {filteredUnits.length === 0 && (
                <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                  {units.length === 0 ? 'Todavía no hay unidades cargadas.' : 'Ninguna unidad coincide con el filtro.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
