'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Unit, Lead } from '@/types';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import { useShareLink } from '@/hooks/useShareLink';
import { useProjectCompleteness } from '@/hooks/useProjectCompleteness';
import { getProjectHref, getProjectDisplayUrl } from '@/lib/project-url';

interface ProjectSummary {
  slug: string;
  buildingCount: number;
}

export default function AdminDashboard() {
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const shareLink = useShareLink();
  const { missing: missingSections } = useProjectCompleteness(typeConfig);
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      fetch('/api/admin/units').then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
      fetch('/api/admin/leads').then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
      fetch('/api/admin/project').then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
    ]).then(([unitsData, leadsData, projectData]) => {
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setProject({ slug: projectData.project.slug, buildingCount: (projectData.buildings ?? []).length });
      setLoading(false);
    }).catch((err) => {
      // If unauthorized, redirect to login
      if (err?.message === '401') {
        window.location.href = '/admin/login';
        return;
      }
      console.error(err);
      setError(true);
      setLoading(false);
    });
  }, []);

  useEffect(load, [load]);

  if (loading) return <LoadingSpinner text="Cargando dashboard..." tone="light" />;
  if (error || !project) return <ErrorState message="No se pudo cargar el dashboard." onRetry={load} />;

  const totalUnits = units.length;
  const available = units.filter(u => u.status === 'available').length;
  const reserved = units.filter(u => u.status === 'reserved').length;
  const sold = units.filter(u => u.status === 'sold').length;

  // Un proyecto showcase no tiene precio/estado/leads comerciales — mostrar
  // ese dashboard ahí sería 3 métricas en 0 para siempre. En su lugar, un
  // resumen de lo cargado más el link para compartir.
  const showsCommercialMetrics = typeConfig.showPrice || typeConfig.showStatus || typeConfig.showLeads;

  if (totalUnits === 0) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
          <p className="text-gray-500 mt-1">Visión general del proyecto</p>
        </div>
        <EmptyState
          title={hasUnitStep
            ? `Todavía no hay ${typeConfig.unitLabel.toLowerCase()}s cargados.`
            : `Todavía no hay ${typeConfig.buildingLabel.toLowerCase()}s ${agree.cargado}s.`}
          description={hasUnitStep
            ? `Cargá ${typeConfig.buildingLabel.toLowerCase()}s y ${typeConfig.unitLabel.toLowerCase()}s para ver las métricas acá.`
            : `Cargá ${typeConfig.buildingLabel.toLowerCase()}s para ver las métricas acá.`}
          action={
            <Link
              href="/admin/wizard"
              className="inline-block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
            >
              🪄 Usar el asistente →
            </Link>
          }
        />
      </div>
    );
  }

  if (!showsCommercialMetrics) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Visión general del proyecto</p>
        </div>

        <div className={`grid grid-cols-1 ${hasUnitStep ? 'sm:grid-cols-2' : ''} gap-6`}>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">{typeConfig.buildingLabel}s {agree.cargado}s</div>
            <div className="text-3xl font-bold text-gray-900">{project.buildingCount}</div>
          </div>
          {hasUnitStep && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">{typeConfig.unitLabel}s cargados</div>
              <div className="text-3xl font-bold text-gray-900">{totalUnits}</div>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-1">Compartí tu proyecto</h3>
          <p className="text-sm text-gray-500 mb-4">Mandá este link para que lo vean — no hace falta cuenta ni login.</p>
          {missingSections.length > 0 && (
            <div className="mb-4 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800">
                Antes de compartir, te falta cargar {missingSections.length === 1 ? '1 sección' : `${missingSections.length} secciones`}:{' '}
                {missingSections.map(s => s.label).join(', ')}.
              </p>
              <Link href="/admin/sitio" className="text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2">
                Completar ahora →
              </Link>
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="font-mono text-sm text-gray-900 bg-gray-50 px-4 py-2.5 rounded-lg truncate flex-1">
              {getProjectDisplayUrl(project.slug, typeof window !== 'undefined' ? window.location.origin : '')}
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => shareLink(getProjectDisplayUrl(project.slug, window.location.origin), 'Mi proyecto', 'Mirá mi proyecto')}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
              >
                Copiar link
              </button>
              <a
                href={getProjectHref(project.slug)}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
              >
                Ver sitio ↗
              </a>
            </div>
          </div>
        </div>
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
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
        <p className="text-sm text-gray-500 mt-1">Visión general del proyecto</p>
      </div>

      {missingSections.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
          <p className="text-sm font-medium text-amber-800">
            Antes de compartir, te falta cargar {missingSections.length === 1 ? '1 sección' : `${missingSections.length} secciones`}:{' '}
            {missingSections.map(s => s.label).join(', ')}.
          </p>
          <Link href="/admin/sitio" className="text-sm font-medium text-amber-700 hover:text-amber-900 underline underline-offset-2 whitespace-nowrap">
            Completar ahora →
          </Link>
        </div>
      )}

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
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${totalValue > 0 ? (soldValue / totalValue) * 100 : 0}%` }} />
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
