'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader, SegmentedTabs } from '@/components/admin/panel-ui';
import { PageSkeleton, SkeletonStatStrip, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useCustomDomain } from '@/lib/custom-domain-context';
import { useProjectRole } from '@/lib/project-role-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { hasRole } from '@/lib/project-roles';
import type { Channel } from '@/lib/analytics/channels';
import type { MetricsRange, MetricsResponse } from '@/lib/analytics/metrics';
import MetricsSummary from '@/components/admin/metrics/MetricsSummary';
import UnitRanking from '@/components/admin/metrics/UnitRanking';
import ChannelsPanel from '@/components/admin/metrics/ChannelsPanel';

// Métricas del sitio público: Resumen (visitas, embudo, unidades, origen) e
// Inmobiliarias y canales (links con ?ref=). Gestor en adelante, proyectos
// para vender. Spec: docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md

type Tab = 'resumen' | 'canales';
const TAB_LABEL: Record<Tab, string> = { resumen: 'Resumen', canales: 'Inmobiliarias y canales' };
const RANGE_OPTIONS: { value: MetricsRange; label: string }[] = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: 'all', label: 'Todo' },
];

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function Metricas() {
  const router = useRouter();
  const params = useSearchParams();
  const activeProjectId = useActiveProjectId();
  const customDomain = useCustomDomain();
  const typeConfig = useProjectTypeConfig();
  const role = useProjectRole();
  const canSee = typeConfig.showLeads && hasRole(role, 'gestor');
  const tab: Tab = params.get('tab') === 'canales' ? 'canales' : 'resumen';

  const [range, setRange] = useState<MetricsRange>('30');
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [projectSlug, setProjectSlug] = useState('');
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!canSee) router.replace('/admin');
  }, [canSee, router]);

  useEffect(() => {
    if (!canSee) return;
    let alive = true;
    Promise.all([
      getJson<MetricsResponse>(withActiveProject(`/api/admin/metrics?range=${range}`, activeProjectId)),
      getJson<Channel[]>(withActiveProject('/api/admin/channels', activeProjectId)),
      getJson<{ project: { slug: string } }>(withActiveProject('/api/admin/project', activeProjectId)),
    ]).then(([m, c, p]) => {
      if (!alive) return;
      setMetrics(m);
      setChannels(c);
      setProjectSlug(p.project.slug);
      setError(false);
    }).catch(err => {
      if (!alive) return;
      if (err?.message === '401') { window.location.href = '/admin/login'; return; }
      console.error(err);
      setError(true);
    });
    return () => { alive = false; };
  }, [canSee, range, activeProjectId, reload]);

  const goTo = (t: Tab) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', t);
    router.replace(`?${next.toString()}`, { scroll: false });
  };
  const refresh = useCallback(() => setReload(r => r + 1), []);

  if (!canSee) return null;
  if (error) return <ErrorState message="No se pudieron cargar las métricas." onRetry={() => { setError(false); refresh(); }} />;
  if (!metrics) return (
    <PageSkeleton actions={1}>
      <SkeletonStatStrip count={4} />
      <div className="grid gap-4 md:grid-cols-2"><SkeletonCard lines={4} /><SkeletonCard lines={4} /></div>
    </PageSkeleton>
  );

  const empty = metrics.summary.visitors === 0 && metrics.range === 'all';

  return (
    <div className="flex flex-col gap-6 sm:gap-7">
      <PageHeader
        eyebrow="Operación"
        title="Métricas"
        description="Cuánta gente entra al sitio, qué mira y quién la trae."
        actions={<SegmentedTabs label="Período" value={range} onChange={setRange} options={RANGE_OPTIONS} />}
      />

      <div role="tablist" aria-label="Métricas" className="flex flex-nowrap gap-6 sm:gap-7 overflow-x-auto border-b border-gray-200 [scrollbar-width:none]">
        {(Object.keys(TAB_LABEL) as Tab[]).map(id => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => goTo(id)}
              className={`-mb-px pb-3 pt-1 px-0.5 shrink-0 whitespace-nowrap text-[15px] border-b-2 transition-colors ${
                on ? 'border-gray-900 font-semibold text-gray-900' : 'border-transparent font-medium text-gray-600 hover:text-gray-900'
              }`}
            >
              {TAB_LABEL[id]}
            </button>
          );
        })}
      </div>

      {tab === 'resumen' && (
        empty ? (
          <p className="m-0 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-[15px] text-gray-600">
            Todavía no hay visitas registradas. Compartí el link del proyecto para empezar a medir.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <MetricsSummary data={metrics} onGoToChannels={() => goTo('canales')} />
            {typeConfig.hasUnitStep && <UnitRanking units={metrics.units} showStatus={typeConfig.showStatus} />}
          </div>
        )
      )}

      {tab === 'canales' && (
        <ChannelsPanel
          channels={channels}
          stats={metrics.sources}
          projectSlug={projectSlug}
          customDomain={customDomain}
          activeProjectId={activeProjectId}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

export default function MetricasPage() {
  return (
    <Suspense>
      <Metricas />
    </Suspense>
  );
}
