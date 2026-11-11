'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import type { Lead } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageSkeleton, SkeletonStatStrip, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import { useShareLink } from '@/hooks/useShareLink';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { PageHeader, Card, CardHeader, StatStrip, Pill, SegmentedTabs, btnPrimary } from '@/components/admin/panel-ui';

import { pluralize } from '@/lib/units';
import { useCustomDomain } from '@/lib/custom-domain-context';
interface ProjectSummary {
  slug: string;
  name: string;
  buildingCount: number;
}

// building_name/floor_number no son columnas reales de `units` — las agrega
// /api/admin/units enriqueciendo cada fila para el listado global.
type Unit = Pick<DbUnitRow, 'id' | 'code' | 'total_area' | 'status' | 'price' | 'model_name'> & {
  building_name: string | null;
  floor_number: number | null;
};

export default function AdminDashboard() {
  const customDomain = useCustomDomain();
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const shareLink = useShareLink();
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const [units, setUnits] = useState<Unit[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<'7' | '30' | 'all'>('30');
  // Momento de la última carga — referencia para el filtro de período (no se llama Date.now() en el render).
  const [loadedAt, setLoadedAt] = useState(0);

  const load = useCallback(() => {
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
    Promise.all([
      fetch(withActiveProject('/api/admin/units', activeProjectId)).then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
      fetch(withActiveProject('/api/admin/leads', activeProjectId)).then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
      fetch(withActiveProject('/api/admin/project', activeProjectId)).then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); }),
    ]).then(([unitsData, leadsData, projectData]) => {
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
      setLoadedAt(Date.now());
      setProject({ slug: projectData.project.slug, name: projectData.project.name ?? '', buildingCount: (projectData.buildings ?? []).length });
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
  }, [activeProjectId]);

  useEffect(load, [load]);

  if (loading) return (
    <PageSkeleton actions={1}>
      <SkeletonStatStrip count={4} />
      <div className="grid gap-4 md:grid-cols-2"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>
    </PageSkeleton>
  );
  if (error || !project) return <ErrorState message="No se pudo cargar el dashboard." onRetry={load} />;

  const totalUnits = units.length;
  const available = units.filter(u => u.status === 'available').length;
  const reserved = units.filter(u => u.status === 'reserved').length;
  const sold = units.filter(u => u.status === 'sold').length;
  const unitWord = (count: number) => count === 1 ? typeConfig.unitLabel.toLowerCase() : `${pluralize(typeConfig.unitLabel.toLowerCase())}`;
  const displayUrl = getProjectDisplayUrl(project.slug, typeof window !== 'undefined' ? window.location.origin : '', customDomain);
  const shareUrl = () => getProjectDisplayUrl(project.slug, window.location.origin, customDomain);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast('Link copiado al portapapeles');
    } catch {
      shareLink(shareUrl(), project.name || 'Mi proyecto', 'Mirá mi proyecto');
    }
  };
  const whatsappHref = () => `https://wa.me/?text=${encodeURIComponent(`${project.name ? `Mirá ${project.name}` : 'Mirá mi proyecto'}: ${shareUrl()}`)}`;

  // Un proyecto showcase no tiene precio/estado/leads comerciales — mostrar
  // ese dashboard ahí sería 3 métricas en 0 para siempre. Una casa (1 unidad)
  // o un loteo (1 etapa) tampoco: el dashboard "de proyecto" no aplica cuando
  // el proyecto ES una sola cosa — se muestra un resumen + link para compartir.
  const showsCommercialMetrics = hasUnitStep && !typeConfig.singleBuilding
    && (typeConfig.showPrice || typeConfig.showStatus || typeConfig.showLeads);

  const shareCard = (
    <section className="rounded-2xl bg-gray-900 text-white px-5 sm:px-[22px] py-5 flex items-center gap-4 flex-wrap">
      <span className="flex-[1_1_180px] min-w-0 flex flex-col gap-0.5">
        <span className="text-sm font-semibold">Compartí tu proyecto</span>
        <span className="font-mono text-xs text-[#C9C6BE] truncate">{displayUrl.replace(/^https?:\/\//, '')}</span>
      </span>
      <div className="flex gap-2 flex-wrap">
        <button type="button" onClick={copyLink} className="min-h-[40px] px-3.5 rounded-[10px] bg-white text-gray-900 text-[13px] font-semibold hover:bg-gray-100">Copiar link</button>
        <a href={whatsappHref()} target="_blank" rel="noopener noreferrer" className="min-h-[40px] px-3.5 rounded-[10px] border border-gray-600 text-white text-[13px] font-semibold flex items-center hover:border-gray-400">WhatsApp</a>
      </div>
    </section>
  );

  if (totalUnits === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Visión general" title="Dashboard" />
        <Card className="flex flex-col items-start gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">
            {hasUnitStep
              ? `Todavía no hay ${pluralize(typeConfig.unitLabel.toLowerCase())} ${uAgree.cargado}s.`
              : `Todavía no hay ${pluralize(typeConfig.buildingLabel.toLowerCase())} ${agree.cargado}s.`}
          </h2>
          <p className="m-0 text-sm text-gray-600">
            {hasUnitStep
              ? `Cargá ${pluralize(typeConfig.buildingLabel.toLowerCase())} y ${pluralize(typeConfig.unitLabel.toLowerCase())} para ver las métricas acá.`
              : `Cargá ${pluralize(typeConfig.buildingLabel.toLowerCase())} para ver las métricas acá.`}
          </p>
          <Link href="/admin/carga" className={btnPrimary}>Empezar la carga guiada →</Link>
        </Card>
      </div>
    );
  }

  if (!showsCommercialMetrics) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader eyebrow="Visión general" title="Dashboard" />
        {/* Para "casa" (una sola unidad) el conteo no aporta — se va directo
            al link para compartir. Para el resto, las cifras. */}
        {hasUnitStep && (
          <StatStrip stats={[
            { label: `${pluralize(typeConfig.buildingLabel)} ${agree.cargado}s`, value: project.buildingCount },
            { label: `${pluralize(typeConfig.unitLabel)} ${uAgree.cargado}s`, value: totalUnits },
          ]} />
        )}
        {shareCard}
      </div>
    );
  }

  const totalValue = units.reduce((acc, u) => acc + (u.price || 0), 0);
  const soldValue = units.filter(u => u.status === 'sold').reduce((acc, u) => acc + (u.price || 0), 0);
  const reservedValue = units.filter(u => u.status === 'reserved').reduce((acc, u) => acc + (u.price || 0), 0);
  const availableValue = units.filter(u => u.status === 'available').reduce((acc, u) => acc + (u.price || 0), 0);
  const unitsWithoutPrice = units.filter(u => !u.price);
  const withPrice = totalUnits - unitsWithoutPrice.length;

  const segs = [
    { label: 'Disponibles', count: available, color: STATUS_COLOR.available },
    { label: 'Reservadas', count: reserved, color: STATUS_COLOR.reserved },
    { label: 'Vendidas', count: sold, color: STATUS_COLOR.sold },
  ];

  // "Por tipología" si las unidades tienen modelo cargado; si no, por edificio.
  const hasModels = units.some(u => u.model_name);
  const groupKey = (u: Unit) => (hasModels ? (u.model_name || 'Sin tipología') : (u.building_name || 'Sin edificio'));
  const groupNames = Array.from(new Set(units.map(groupKey))).sort((a, b) => a.localeCompare(b, 'es'));
  const groups = groupNames.map(name => {
    const list = units.filter(u => groupKey(u) === name);
    return {
      name,
      a: list.filter(u => u.status === 'available').length,
      r: list.filter(u => u.status === 'reserved').length,
      s: list.filter(u => u.status === 'sold').length,
      total: list.length,
    };
  });

  const rangeStart = range === 'all' ? 0 : loadedAt - (range === '7' ? 7 : 30) * 86400000;
  const recentLeads = [...leads]
    .filter(l => new Date(l.created_at).getTime() >= rangeStart)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visión general"
        title="Dashboard"
        actions={<SegmentedTabs label="Período de los leads" value={range} onChange={setRange} options={[{ value: '7', label: '7 días' }, { value: '30', label: '30 días' }, { value: 'all', label: 'Todo' }]} />}
      />


      <StatStrip stats={[
        { label: 'Valor listado total', value: usd(totalValue), hint: `${withPrice} ${unitWord(withPrice)} con precio` },
        { label: 'Potencial disponible', value: usd(availableValue), hint: `${available} ${unitWord(available)}` },
        { label: 'Reservado', value: usd(reservedValue), hint: `${reserved} ${unitWord(reserved)}` },
        { label: 'Ventas concretadas', value: usd(soldValue), hint: `${sold} ${unitWord(sold)}` },
      ]} />

      <div className="flex gap-5 flex-wrap items-stretch">
        <section className="flex-[3_1_460px] min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-[22px] flex flex-col gap-[18px]">
          <CardHeader title={`Inventario · ${totalUnits} ${unitWord(totalUnits)}`} action={<Link href="/admin/inventory">Ver inventario →</Link>} />
          <div className="flex h-3.5 rounded-[7px] overflow-hidden gap-0.5 bg-gray-100" aria-hidden="true">
            {segs.filter(s => s.count > 0).map(s => <span key={s.label} style={{ flex: s.count, background: s.color }} />)}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {segs.map(s => (
              <div key={s.label} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs text-gray-600"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</span>
                <span className="font-display text-[22px] font-semibold text-gray-900">{s.count}</span>
              </div>
            ))}
          </div>
          {groups.length > 1 && (
            <div className="flex flex-col gap-2.5 pt-4 border-t border-[#F0EDE7]">
              <span className="text-[13px] font-semibold text-gray-900">{hasModels ? 'Por tipología' : `Por ${typeConfig.buildingLabel.toLowerCase()}`}</span>
              {groups.map(g => (
                <div key={g.name} className="flex items-center gap-3 text-[13px]">
                  <span className="w-[110px] sm:w-[130px] truncate text-gray-900" title={g.name}>{g.name}</span>
                  <span className="flex-1 flex h-2 rounded overflow-hidden gap-px bg-gray-100" aria-hidden="true">
                    {g.a > 0 && <span style={{ flex: g.a, background: STATUS_COLOR.available }} />}
                    {g.r > 0 && <span style={{ flex: g.r, background: STATUS_COLOR.reserved }} />}
                    {g.s > 0 && <span style={{ flex: g.s, background: STATUS_COLOR.sold }} />}
                  </span>
                  <span className="w-[86px] sm:w-[96px] text-right text-xs text-gray-600">{g.a} de {g.total} libres</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex-[2_1_320px] min-w-0 rounded-2xl border border-gray-200 bg-white flex flex-col">
          <div className="px-5 sm:px-[22px] pt-5 pb-3">
            <CardHeader title="Últimos leads" action={<Link href="/admin/leads">Abrir CRM →</Link>} />
          </div>
          {recentLeads.length === 0 ? (
            <p className="m-0 px-5 sm:px-[22px] py-8 border-t border-gray-100 text-center text-[13px] text-gray-500">
              {leads.length === 0 ? 'Todavía no hay leads.' : 'No hay leads en este período.'}
            </p>
          ) : recentLeads.map((l, i) => {
            const status = (l.status || 'nuevo') as keyof typeof LEAD_LABEL;
            return (
              <div key={l.id} className="flex items-center gap-3 min-h-[58px] px-5 sm:px-[22px] py-2 border-t border-gray-100">
                <span aria-hidden="true" className="w-[34px] h-[34px] rounded-full shrink-0 text-white text-xs font-semibold flex items-center justify-center" style={{ background: AVATAR_TONES[i % AVATAR_TONES.length] }}>
                  {initials(l.name)}
                </span>
                <span className="flex-1 min-w-0 flex flex-col">
                  <span className="text-[13px] font-semibold text-gray-900 truncate">{l.name ?? 'Sin nombre'}</span>
                  <span className="text-xs text-gray-500 truncate">{l.unit_name ? `Interés: ${l.unit_name}` : (l.phone ?? 'Consulta general')}</span>
                </span>
                <Pill tone={status === 'nuevo' ? 'dark' : 'neutral'}>{LEAD_LABEL[status] ?? 'Nuevo'}</Pill>
              </div>
            );
          })}
        </section>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))' }}>
        {unitsWithoutPrice.length > 0 ? (
          <section className="rounded-2xl border border-[#F0DDB8] bg-amber-50 px-5 sm:px-[22px] py-5 flex gap-4 items-center">
            <span className="font-display text-[32px] font-semibold text-[#6B4510]">{unitsWithoutPrice.length}</span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-sm font-semibold text-[#4A300B]">{unitsWithoutPrice.length === 1 ? `${typeConfig.unitLabel} sin precio` : `${pluralize(typeConfig.unitLabel)} sin precio`}</span>
              <span className="text-xs text-[#6B4510] truncate">{unitsWithoutPrice.slice(0, 4).map(u => u.code).join(' · ')}{unitsWithoutPrice.length > 4 ? ` y ${unitsWithoutPrice.length - 4} más` : ''}</span>
            </span>
            <Link href="/admin/inventory" className="min-h-[40px] flex items-center text-[13px] font-semibold text-[#6B4510] underline underline-offset-2">Completar</Link>
          </section>
        ) : (
          <section className="rounded-2xl border border-gray-200 bg-white px-5 sm:px-[22px] py-5 flex gap-4 items-center">
            <span className="flex-1 text-sm text-gray-700">Todas las {pluralize(typeConfig.unitLabel.toLowerCase())} tienen precio cargado.</span>
            <Link href="/admin/inventory" className="text-[13px] font-semibold text-gray-900 underline underline-offset-2">Ver inventario</Link>
          </section>
        )}
        {shareCard}
      </div>
    </div>
  );
}

// Colores del diseño para el estado de las unidades.
const STATUS_COLOR = { available: '#9DB3A5', reserved: '#E3B567', sold: '#2B302D' };
const AVATAR_TONES = ['#37463F', '#8A6A3A', '#4E5A6B', '#6B4E5A', '#55544F'];
const LEAD_LABEL = { nuevo: 'Nuevo', contactado: 'Contactado', negociacion: 'Negociación', cerrado: 'Cerrado' } as const;

function initials(name: string | null): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}

/** "USD 11,4 M" / "USD 850.000" — formato de las cifras del diseño. */
function usd(n: number): string {
  if (n >= 1_000_000) return `USD ${(n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 })} M`;
  return `USD ${Math.round(n).toLocaleString('es-AR')}`;
}
