'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import type { Lead } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import { useShareLink } from '@/hooks/useShareLink';
import { useProjectCompleteness } from '@/hooks/useProjectCompleteness';
import { getProjectHref, getProjectDisplayUrl } from '@/lib/project-url';
import { poppins, ACCENT, CHART_COLOR, LEAD_BADGE, money } from '@/lib/panel-comercial-style';

interface ProjectSummary {
  slug: string;
  buildingCount: number;
}

// building_name/floor_number no son columnas reales de `units` — las agrega
// /api/admin/units enriqueciendo cada fila para el listado global.
type Unit = Pick<DbUnitRow, 'id' | 'code' | 'total_area' | 'status' | 'price'> & {
  building_name: string | null;
  floor_number: number | null;
};

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
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
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
  // ese dashboard ahí sería 3 métricas en 0 para siempre. Una casa (1 unidad)
  // o un loteo (1 etapa) tampoco: el dashboard "de proyecto" no aplica cuando
  // el proyecto ES una sola cosa — se muestra un resumen + link para compartir.
  const showsCommercialMetrics = hasUnitStep && !typeConfig.singleBuilding
    && (typeConfig.showPrice || typeConfig.showStatus || typeConfig.showLeads);

  if (totalUnits === 0) {
    return (
      <div className={`${poppins.className} space-y-8`}>
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
      <div className={`${poppins.className} space-y-8`}>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
          <p className="text-sm text-gray-500 mt-1">Visión general del proyecto</p>
        </div>

        {/* Para "casa" (una sola unidad) el conteo no aporta — se va directo
            al link para compartir. Para el resto, las tarjetas de conteo. */}
        {hasUnitStep && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">{typeConfig.buildingLabel}s {agree.cargado}s</div>
              <div className="text-3xl font-bold text-gray-900">{project.buildingCount}</div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <div className="text-sm font-semibold text-gray-500 mb-1 uppercase tracking-wide">{typeConfig.unitLabel}s cargados</div>
              <div className="text-3xl font-bold text-gray-900">{totalUnits}</div>
            </div>
          </div>
        )}

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

  const availablePercent = totalUnits ? (available / totalUnits) * 100 : 0;
  const reservedPercent = totalUnits ? (reserved / totalUnits) * 100 : 0;
  const soldPercent = totalUnits ? (sold / totalUnits) * 100 : 0;

  const totalValue = units.reduce((acc, u) => acc + (u.price || 0), 0);
  const soldValue = units.filter(u => u.status === 'sold').reduce((acc, u) => acc + (u.price || 0), 0);
  const reservedValue = units.filter(u => u.status === 'reserved').reduce((acc, u) => acc + (u.price || 0), 0);
  const availableValue = units.filter(u => u.status === 'available').reduce((acc, u) => acc + (u.price || 0), 0);
  const unitsWithoutPrice = units.filter(u => !u.price);
  const newLeadsCount = leads.filter(l => (l.status || 'nuevo') === 'nuevo').length;
  const buildingNames = Array.from(new Set(units.map(u => u.building_name).filter((n): n is string => !!n)));
  const unitWord = (count: number) => count === 1 ? typeConfig.unitLabel.toLowerCase() : `${typeConfig.unitLabel.toLowerCase()}s`;

  const segs = [
    { label: 'Disponibles', count: available, pct: availablePercent, color: CHART_COLOR.available },
    { label: 'Reservadas', count: reserved, pct: reservedPercent, color: CHART_COLOR.reserved },
    { label: 'Vendidas', count: sold, pct: soldPercent, color: CHART_COLOR.sold },
  ];

  const byBuilding = buildingNames.map(name => {
    const list = units.filter(u => u.building_name === name);
    const a = list.filter(u => u.status === 'available').length;
    const r = list.filter(u => u.status === 'reserved').length;
    const s = list.filter(u => u.status === 'sold').length;
    const v = list.reduce((acc, u) => acc + (u.price || 0), 0);
    const missing = list.filter(u => !u.price).length;
    const floors = new Set(list.map(u => u.floor_number).filter(f => f != null)).size;
    return {
      name,
      count: list.length,
      floors,
      segs: [
        { pct: list.length ? (a / list.length) * 100 : 0, color: CHART_COLOR.available },
        { pct: list.length ? (r / list.length) * 100 : 0, color: CHART_COLOR.reserved },
        { pct: list.length ? (s / list.length) * 100 : 0, color: CHART_COLOR.sold },
      ],
      value: v,
      missing,
    };
  });

  const recentLeads = [...leads]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className={`${poppins.className} flex flex-col gap-4`}>
      <div className="flex items-end justify-between gap-5 flex-wrap">
        <div>
          <div className="text-[22px] font-semibold leading-tight text-[#101828]">Dashboard comercial</div>
          <div className="text-xs leading-relaxed text-[rgba(16,24,40,.55)] mt-[5px]">
            {totalUnits} {unitWord(totalUnits)} en venta{buildingNames.length > 0 ? ` · ${buildingNames.join(' y ')}` : ''} · actualizado hoy
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link
            href="/admin/inventory"
            className="h-9 px-3.5 flex items-center rounded-[9px] border border-[rgba(16,24,40,.14)] bg-white text-[#101828] font-medium text-[12px] transition-colors"
          >
            Actualizar inventario
          </Link>
          <Link
            href="/admin/leads"
            className="h-9 px-[15px] flex items-center rounded-[9px] bg-[#101828] font-medium text-[12px] text-white transition-colors"
          >
            Ir a Leads →
          </Link>
        </div>
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

      {unitsWithoutPrice.length > 0 && (
        <div className="rounded-[11px] p-[12px_15px] flex items-center gap-3 flex-wrap" style={{ background: '#fdf7ec', border: '1px solid rgba(176,124,32,.22)' }}>
          <div className="flex-1 min-w-[240px] text-[11.5px] leading-relaxed" style={{ color: '#7a5514' }}>
            {unitsWithoutPrice.length} {unitWord(unitsWithoutPrice.length)} sigue{unitsWithoutPrice.length === 1 ? '' : 'n'} en $0: {unitsWithoutPrice.length === 1 ? 'queda' : 'quedan'} fuera del valor listado y el sitio la{unitsWithoutPrice.length === 1 ? '' : 's'} muestra sin precio.
          </div>
          <Link href="/admin/inventory" className="h-[31px] px-3 flex items-center rounded-lg bg-[#101828] text-[11.5px] font-medium text-white shrink-0">
            Cargar precios →
          </Link>
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(212px, 1fr))' }}>
        <KpiCard label="Disponibles" value={available} of={totalUnits} note={`${money(availableValue)} en oferta`} pct={availablePercent} color={ACCENT} />
        <KpiCard label="Reservadas" value={reserved} of={totalUnits} note={reserved ? `${money(reservedValue)} comprometidos` : 'sin reservas activas'} pct={reservedPercent} color="#d9a13a" />
        <KpiCard label="Ventas concretadas" value={sold} of={totalUnits} note={`${money(soldValue)} escriturados`} pct={soldPercent} color="#2f5d7c" />
        <KpiCard label="Leads sin contactar" value={newLeadsCount} of={leads.length} ofPrefix="de " note={leads.length ? `de ${leads.length} en total` : 'sin leads todavía'} pct={leads.length ? (newLeadsCount / leads.length) * 100 : 0} color="#b3261e" />
      </div>

      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <div className="bg-white rounded-xl p-4 pb-[18px]" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[14px] font-semibold text-[#101828]">Distribución del inventario</div>
            <div className="text-[11px]" style={{ color: 'rgba(16,24,40,.45)' }}>{totalUnits} unidades</div>
          </div>
          <div className="flex rounded-[7px] overflow-hidden mt-3.5" style={{ height: 12, background: 'rgba(16,24,40,.06)' }}>
            {segs.map(s => <div key={s.label} style={{ width: `${s.pct}%`, background: s.color }} />)}
          </div>
          <div className="flex flex-wrap gap-5 mt-[13px]">
            {segs.map(s => (
              <div key={s.label} className="flex items-center gap-[7px]">
                <div className="w-[9px] h-[9px] rounded-full shrink-0" style={{ background: s.color }} />
                <div className="text-[11.5px]" style={{ color: 'rgba(16,24,40,.62)' }}>{s.label}</div>
                <div className="text-[11.5px] font-semibold text-[#101828]">{s.count}</div>
                <div className="text-[11px]" style={{ color: 'rgba(16,24,40,.4)' }}>{totalUnits ? Math.round(s.pct) : 0}%</div>
              </div>
            ))}
          </div>

          {byBuilding.length > 0 && (
            <>
              <div className="h-px my-4 mt-4 mb-1" style={{ background: 'rgba(16,24,40,.08)' }} />
              {byBuilding.map(b => (
                <div key={b.name} className="flex items-center gap-3.5 py-[11px]" style={{ borderBottom: '1px solid rgba(16,24,40,.06)' }}>
                  <div className="w-24 shrink-0">
                    <div className="text-[12.5px] font-medium text-[#101828]">{b.name}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: 'rgba(16,24,40,.45)' }}>{b.count} unidades{b.floors ? ` · ${b.floors} pisos` : ''}</div>
                  </div>
                  <div className="flex-1 min-w-[90px] flex rounded-[5px] overflow-hidden" style={{ height: 9, background: 'rgba(16,24,40,.06)' }}>
                    {b.segs.map((s, i) => <div key={i} style={{ width: `${s.pct}%`, background: s.color }} />)}
                  </div>
                  <div className="w-28 shrink-0 text-right">
                    <div className="text-[12.5px] font-semibold text-[#101828]">{b.value ? money(b.value) : 'sin precios'}</div>
                    <div className="text-[10.5px] mt-0.5" style={{ color: 'rgba(16,24,40,.45)' }}>{b.missing ? `${b.missing} sin precio` : 'valor listado'}</div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 pb-[18px]" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
          <div className="text-[14px] font-semibold text-[#101828]">Resumen financiero</div>
          <div className="text-[10.5px] leading-relaxed mt-1" style={{ color: 'rgba(16,24,40,.5)' }}>
            Sobre {totalUnits - unitsWithoutPrice.length} de {totalUnits} unidades con precio cargado.
          </div>
          <div className="flex flex-col gap-3.5 mt-4">
            <FinRow label="Valor listado total" value={money(totalValue)} color="#101828" note={`${unitsWithoutPrice.length} unidades todavía sin precio`} pct={100} barColor="rgba(16,24,40,.7)" />
            <FinRow label="Ventas concretadas" value={money(soldValue)} color="#2f5d7c" note={`${Math.round(totalValue ? (soldValue / totalValue) * 100 : 0)}% del valor listado`} pct={totalValue ? (soldValue / totalValue) * 100 : 0} barColor="#2f5d7c" />
            <FinRow label="Reservado" value={money(reservedValue)} color="#a06a12" note="por confirmar seña" pct={totalValue ? (reservedValue / totalValue) * 100 : 0} barColor="#d9a13a" />
            <FinRow label="Potencial disponible" value={money(availableValue)} color="#0f7a4d" note={`promedio ${money(available ? availableValue / available : 0)} por unidad`} pct={totalValue ? (availableValue / totalValue) * 100 : 0} barColor={ACCENT} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: '1.25fr 1fr' }}>
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
          <div className="h-[46px] px-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(16,24,40,.08)' }}>
            <div className="text-[14px] font-semibold text-[#101828]">Unidades sin precio</div>
            <Link href="/admin/inventory" className="text-[11px] font-medium shrink-0 text-[#5c7a58]">Ver inventario →</Link>
          </div>
          {unitsWithoutPrice.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'rgba(16,24,40,.4)' }}>Todas las unidades tienen precio cargado.</div>
          ) : (
            unitsWithoutPrice.slice(0, 6).map(u => (
              <div key={u.id} className="flex items-center gap-[11px] py-3 px-4" style={{ borderBottom: '1px solid rgba(16,24,40,.06)' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] font-medium text-[#101828]">{u.code}</div>
                  <div className="text-[10.5px] mt-0.5" style={{ color: 'rgba(16,24,40,.5)' }}>{u.building_name ?? '—'}{u.floor_number != null ? ` · Planta ${u.floor_number}` : ''}</div>
                </div>
                <span className="text-[10px] font-medium px-2 py-1 rounded-md shrink-0" style={{ background: '#fdf7ec', color: '#7a5514' }}>Sin precio</span>
              </div>
            ))
          )}
        </div>

        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
          <div className="h-[46px] px-4 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid rgba(16,24,40,.08)' }}>
            <div className="text-[14px] font-semibold text-[#101828]">Últimos leads</div>
            <Link href="/admin/leads" className="text-[11px] font-medium shrink-0 text-[#5c7a58]">Abrir CRM →</Link>
          </div>
          {recentLeads.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'rgba(16,24,40,.4)' }}>Todavía no hay leads.</div>
          ) : (
            recentLeads.map(l => {
              const badge = LEAD_BADGE[(l.status || 'nuevo') as keyof typeof LEAD_BADGE] ?? LEAD_BADGE.nuevo;
              return (
                <div key={l.id} className="flex items-center gap-2.5 py-3 px-4" style={{ borderBottom: '1px solid rgba(16,24,40,.06)' }}>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[#101828] truncate">{l.name ?? 'Sin nombre'}</div>
                    <div className="text-[10.5px] mt-0.5 truncate" style={{ color: 'rgba(16,24,40,.5)' }}>{l.phone}{l.unit_name ? ` · ${l.unit_name}` : ''}</div>
                  </div>
                  <span className="text-[10px] font-medium h-[21px] px-2 flex items-center rounded-md shrink-0" style={{ background: badge.bg, color: badge.color }}>{badge.label}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, of, ofPrefix = '/ ', note, pct, color }: {
  label: string; value: number; of: number; ofPrefix?: string; note: string; pct: number; color: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4" style={{ border: '1px solid rgba(16,24,40,.09)' }}>
      <div className="text-[9.5px] font-semibold uppercase" style={{ color: 'rgba(16,24,40,.5)', letterSpacing: '.1em' }}>{label}</div>
      <div className="flex items-baseline gap-1.5 mt-[11px]">
        <div className="text-[27px] font-semibold leading-none text-[#101828]">{value}</div>
        <div className="text-[13px]" style={{ color: 'rgba(16,24,40,.4)' }}>{ofPrefix}{of}</div>
      </div>
      <div className="h-[5px] rounded-[3px] mt-[13px] overflow-hidden" style={{ background: 'rgba(16,24,40,.07)' }}>
        <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="text-[10.5px] leading-relaxed mt-[9px]" style={{ color: 'rgba(16,24,40,.5)' }}>{note}</div>
    </div>
  );
}

function FinRow({ label, value, color, note, pct, barColor }: {
  label: string; value: string; color: string; note: string; pct: number; barColor: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2.5">
        <div className="text-[11.5px]" style={{ color: 'rgba(16,24,40,.62)' }}>{label}</div>
        <div className="text-[14px] font-semibold" style={{ color }}>{value}</div>
      </div>
      <div className="h-[5px] rounded-[3px] mt-2 overflow-hidden" style={{ background: 'rgba(16,24,40,.07)' }}>
        <div className="h-full rounded-[3px]" style={{ width: `${pct}%`, background: barColor }} />
      </div>
      <div className="text-[10px] mt-1.5" style={{ color: 'rgba(16,24,40,.42)' }}>{note}</div>
    </div>
  );
}
