'use client';

import { useState, useEffect } from 'react';
import type { Unit } from '@/types';

export default function AdminInventory() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUnits();
  }, []);

  const fetchUnits = async () => {
    try {
      const res = await fetch('/api/units');
      const data = await res.json();
      setUnits(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateUnit = async (id: string, updates: Partial<Unit>) => {
    setSavingId(id);
    try {
      const res = await fetch(`/api/units/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
      if (res.ok) {
        setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
      } else {
        alert("Error al actualizar la unidad");
      }
    } catch (error) {
      console.error(error);
      alert("Error al actualizar la unidad");
    } finally {
      setSavingId(null);
    }
  };

  if (loading) return <div className="text-gray-500">Cargando inventario...</div>;

  return (
    <div>
      <div className="flex justify-between items-end mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gestión de Inventario</h2>
          <p className="text-gray-500 mt-1">Actualizá estados y precios de las unidades</p>
        </div>
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
              {units.map(unit => (
                <tr key={unit.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{unit.name}</div>
                    <div className="text-xs text-gray-500">{unit.totalArea} m² total</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    <span className="capitalize">{unit.buildingId.replace('-', ' ')}</span>
                    <span className="mx-2 text-gray-300">|</span>
                    Planta {unit.floor}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 uppercase tracking-wide">
                    {unit.modelName}
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
