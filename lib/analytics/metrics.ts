import type { Channel } from './channels';

// Forma de las métricas del panel (GET /api/admin/metrics) y la lógica pura
// que arma la respuesta a partir de las funciones SQL site_* (schema.sql).

export type MetricsRange = '7' | '30' | 'all';

const DAY = 86_400_000;

export function parseRange(v: string | null): MetricsRange {
  return v === '7' || v === 'all' ? v : '30';
}

export function rangeSince(range: MetricsRange, now: number): string {
  if (range === 'all') return '-infinity';
  return new Date(now - Number(range) * DAY).toISOString();
}

export function conversionRate(converters: number, visitors: number): number | null {
  return visitors > 0 ? converters / visitors : null;
}

export interface MetricsSummary {
  visitors: number;
  sessions: number;
  unit_viewers: number;
  tour_viewers: number;
  /** Visitantes que dejaron un lead en el sitio o tocaron WhatsApp. */
  web_converters: number;
  web_leads: number;
  whatsapp_clickers: number;
  /** Leads sin visitante (bot de WhatsApp, cargados a mano, anteriores a la analítica). */
  other_leads: number;
  mobile_visitors: number;
  desktop_visitors: number;
  rate: number | null;
}

export interface UnitStat {
  unit_id: string;
  code: string;
  building_name: string;
  floor_number: number;
  status: string;
  views: number;
  viewers: number;
  avg_seconds: number | null;
  tours: number;
  leads: number;
}

export interface SourceRow {
  ref: string | null;
  referrer_host: string | null;
  visitors: number;
  converters: number;
}

export interface ChannelStat extends Channel {
  visitors: number;
  converters: number;
  rate: number | null;
}

export interface SourcesBreakdown {
  channels: ChannelStat[];
  unregistered: { ref: string; visitors: number; converters: number }[];
  direct: { host: string | null; visitors: number; converters: number }[];
}

export interface MetricsResponse {
  range: MetricsRange;
  summary: MetricsSummary;
  units: UnitStat[];
  sources: SourcesBreakdown;
}

const byVisitors = <T extends { visitors: number }>(a: T, b: T) => b.visitors - a.visitors;

export function groupSources(rows: SourceRow[], channels: Channel[]): SourcesBreakdown {
  const bySlug = new Map(channels.map(c => [c.slug, { visitors: 0, converters: 0 }]));
  const unregistered = new Map<string, { visitors: number; converters: number }>();
  const direct = new Map<string | null, { visitors: number; converters: number }>();

  for (const r of rows) {
    const visitors = Number(r.visitors) || 0;
    const converters = Number(r.converters) || 0;
    const bucket = r.ref
      ? bySlug.get(r.ref) ?? unregistered.get(r.ref) ?? unregistered.set(r.ref, { visitors: 0, converters: 0 }).get(r.ref)!
      : direct.get(r.referrer_host) ?? direct.set(r.referrer_host, { visitors: 0, converters: 0 }).get(r.referrer_host)!;
    bucket.visitors += visitors;
    bucket.converters += converters;
  }

  return {
    channels: channels
      .map(c => {
        const t = bySlug.get(c.slug)!;
        return { ...c, ...t, rate: conversionRate(t.converters, t.visitors) };
      })
      .filter(c => !c.archived_at || c.visitors > 0)
      .sort(byVisitors),
    unregistered: [...unregistered].map(([ref, t]) => ({ ref, ...t })).sort(byVisitors),
    direct: [...direct].map(([host, t]) => ({ host, ...t })).sort(byVisitors),
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const s = Math.round(Number(seconds));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rest = s % 60;
  return rest ? `${m} min ${rest} s` : `${m} min`;
}

export type UnitSortKey = 'code' | 'views' | 'viewers' | 'avg_seconds' | 'tours' | 'leads';

/** Copia ordenada del ranking. Los vacíos (sin tiempo medido) van siempre al final; empate por código. */
export function sortUnitStats(units: UnitStat[], key: UnitSortKey, dir: 'asc' | 'desc'): UnitStat[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...units].sort((a, b) => {
    if (key === 'code') return sign * a.code.localeCompare(b.code, 'es', { numeric: true });
    const va = a[key] == null ? null : Number(a[key]);
    const vb = b[key] == null ? null : Number(b[key]);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) {
      return sign * (va - vb);
    }
    return a.code.localeCompare(b.code, 'es', { numeric: true });
  });
}
