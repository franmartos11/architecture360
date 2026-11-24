import { NextResponse } from 'next/server';
import { serverError } from '@/lib/api-errors';
import { requireChannelsAccess, refsWithTraffic } from '@/lib/analytics/channels-server';
import { CHANNEL_COLUMNS, type Channel } from '@/lib/analytics/channels';
import {
  parseRange, rangeSince, conversionRate, groupSources,
  type MetricsResponse, type MetricsSummary, type SourceRow, type UnitStat,
} from '@/lib/analytics/metrics';

// Métricas del sitio público del proyecto activo para la pantalla Métricas.
// Las funciones SQL son security invoker: con el cliente de sesión aplican las
// RLS (gestor en adelante), igual que leads. ?range=7|30|all (default 30).
export async function GET(request: Request) {
  const ctx = await requireChannelsAccess(request);
  if (!ctx.ok) return ctx.error;
  const { projectId, supabase } = ctx;

  const range = parseRange(new URL(request.url).searchParams.get('range'));
  const args = { p_project_id: projectId, p_since: rangeSince(range, Date.now()) };

  try {
    const [summaryRes, unitsRes, sourcesRes, traffic, channelsRes] = await Promise.all([
      supabase.rpc('site_metrics_summary', args),
      supabase.rpc('site_unit_ranking', args),
      supabase.rpc('site_traffic_sources', args),
      refsWithTraffic(supabase, projectId),
      supabase.from('project_channels').select(CHANNEL_COLUMNS).eq('project_id', projectId),
    ]);
    const failed = [summaryRes, unitsRes, sourcesRes, channelsRes].find(r => r.error);
    if (failed) return serverError(failed.error, 'No se pudieron cargar las métricas.');

    const raw = (summaryRes.data ?? {}) as Omit<MetricsSummary, 'rate'>;
    const summary: MetricsSummary = { ...raw, ficha_downloads: Number(raw.ficha_downloads) || 0, rate: conversionRate(raw.web_converters ?? 0, raw.visitors ?? 0) };
    const channels: Channel[] = ((channelsRes.data ?? []) as Omit<Channel, 'has_traffic'>[])
      .map(c => ({ ...c, has_traffic: traffic.has(c.slug) }));

    const body: MetricsResponse = {
      range,
      summary,
      units: (unitsRes.data ?? []) as UnitStat[],
      sources: groupSources((sourcesRes.data ?? []) as SourceRow[], channels),
    };
    return NextResponse.json(body);
  } catch (e) {
    return serverError(e, 'No se pudieron cargar las métricas.');
  }
}
