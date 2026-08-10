'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Unit } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';

export default function AdminDashboard() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch('/api/admin/units').then(res => res.json()),
      fetch('/api/leads').then(res => res.json())
    ]).then(([unitsData, leadsData]) => {
      setUnits(unitsData);
      setLeads(leadsData);
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingSpinner text="Cargando dashboard..." tone="light" />;
  if (error) return <ErrorState message="No se pudo cargar el dashboard." onRetry={load} />;

  const totalUnits = units.length;
  const available = units.filter(u => u.status === 'available').length;
  const reserved = units.filter(u => u.status === 'reserved').length;
  const sold = units.filter(u => u.status === 'sold').length;

  if (totalUnits === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">Visión general del proyecto</p>
        </div>
        <EmptyState title="Todavía no hay unidades cargadas." description="Cargá edificios, pisos y unidades para ver las métricas acá." />
      </div>
    );
  }

  const availablePercent = (available / totalUnits) * 100;
  const reservedPercent = (reserved / totalUnits) * 100;
  const soldPercent = (sold / totalUnits) * 100;

  const totalValue = units.reduce((acc, u) => acc + (u.price || 0), 0);
  const soldValue = units.filter(u => u.status === 'sold').reduce((acc, u) => acc + (u.price || 0), 0);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500 mt-1">Visión general del proyecto</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">Unidades Disponibles</div>
          <div className="text-3xl font-bold text-gray-900">{available} <span className="text-lg text-gray-400 font-medium">/ {totalUnits}</span></div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${availablePercent}%` }} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">Ventas Concretadas</div>
          <div className="text-3xl font-bold text-gray-900">{sold} <span className="text-lg text-gray-400 font-medium">/ {totalUnits}</span></div>
          <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${soldPercent}%` }} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">Nuevos Leads</div>
          <div className="text-3xl font-bold text-gray-900">{leads.length}</div>
          <div className="text-sm text-brand-600 font-medium mt-4 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
            Crecimiento sostenido
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-6">Distribución del Inventario</h3>
          <div className="flex items-center justify-center mb-6">
            <div className="relative w-48 h-48 rounded-full shadow-inner flex items-center justify-center" style={{
              background: `conic-gradient(
                #10B981 0% ${availablePercent}%, 
                #F59E0B ${availablePercent}% ${availablePercent + reservedPercent}%, 
                #3B82F6 ${availablePercent + reservedPercent}% 100%
              )`
            }}>
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-sm">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{totalUnits}</div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total</div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#10B981]" />
              <span className="text-sm text-gray-600">Disponibles</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F59E0B]" />
              <span className="text-sm text-gray-600">Reservadas</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#3B82F6]" />
              <span className="text-sm text-gray-600">Vendidas</span>
            </div>
          </div>
        </div>

        {/* Resumen Financiero */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-6">Resumen Financiero</h3>
          <div className="space-y-6">
            <div>
              <div className="flex justify-between items-end mb-2">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Valor Total del Proyecto</div>
                <div className="text-xl font-bold text-gray-900">${totalValue.toLocaleString()}</div>
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <div className="flex justify-between items-end mb-2">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Ventas Concretadas</div>
                <div className="text-xl font-bold text-blue-600">${soldValue.toLocaleString()}</div>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(soldValue / totalValue) * 100}%` }} />
              </div>
            </div>
            <div className="pt-4 border-t border-gray-100">
              <div className="flex justify-between items-end mb-2">
                <div className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Potencial de Venta (Disponible)</div>
                <div className="text-xl font-bold text-emerald-600">${(totalValue - soldValue).toLocaleString()}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
