'use client';

import { useEffect, useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import type { MetricsRange, MetricsResponse } from '@/lib/analytics/metrics';
import { fmtInt, fmtPct } from './format';

// Tarjeta chica del dashboard con las visitas del sitio en el período elegido.
// Es un extra: si las métricas fallan (p. ej. el SQL todavía no se corrió), no se muestra.
export default function SiteVisitsCard({ range }: { range: MetricsRange }) {
  const activeProjectId = useActiveProjectId();
  const [summary, setSummary] = useState<MetricsResponse['summary'] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(withActiveProject(`/api/admin/metrics?range=${range}`, activeProjectId))
      .then(res => (res.ok ? res.json() : null))
      .then((d: MetricsResponse | null) => { if (alive) setSummary(d?.summary ?? null); })
      .catch(() => { if (alive) setSummary(null); });
    return () => { alive = false; };
  }, [range, activeProjectId]);

  if (!summary) return null;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white px-5 sm:px-[22px] py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
      <span className="text-[13px] font-semibold text-gray-900">Sitio web</span>
      <span className="text-sm text-gray-700"><strong className="font-display text-[20px] text-gray-900 tabular-nums">{fmtInt(summary.visitors)}</strong> visitantes</span>
      <span className="text-sm text-gray-700"><strong className="font-display text-[20px] text-gray-900 tabular-nums">{fmtInt(summary.web_converters)}</strong> consultaron</span>
      <span className="text-sm text-gray-700"><strong className="font-display text-[20px] text-gray-900 tabular-nums">{fmtPct(summary.rate)}</strong> conversión</span>
      <Link href="/admin/metricas" className="sm:ml-auto text-[13px] font-semibold text-gray-900 underline underline-offset-2">Ver métricas →</Link>
    </section>
  );
}
