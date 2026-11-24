import { describe, it, expect } from 'vitest';
import { rangeSince, conversionRate, groupSources, parseRange, formatDuration, sortUnitStats } from './metrics';
import type { Channel } from './channels';

const DAY = 86_400_000;

const ch = (slug: string, over: Partial<Channel> = {}): Channel => ({
  id: `id-${slug}`, name: slug.toUpperCase(), slug, kind: 'inmobiliaria', archived_at: null, created_at: '2026-11-01T00:00:00Z', has_traffic: false, ...over,
});

describe('rangeSince / parseRange', () => {
  it('7 y 30 días hacia atrás; todo = -infinity', () => {
    const now = Date.UTC(2026, 10, 24);
    expect(rangeSince('7', now)).toBe(new Date(now - 7 * DAY).toISOString());
    expect(rangeSince('30', now)).toBe(new Date(now - 30 * DAY).toISOString());
    expect(rangeSince('all', now)).toBe('-infinity');
  });
  it('valor desconocido: 30', () => {
    expect(parseRange('7')).toBe('7');
    expect(parseRange('all')).toBe('all');
    expect(parseRange('90')).toBe('30');
    expect(parseRange(null)).toBe('30');
  });
});

describe('conversionRate', () => {
  it('sin visitantes: null; si no, fracción', () => {
    expect(conversionRate(0, 0)).toBeNull();
    expect(conversionRate(3, 60)).toBe(0.05);
  });
});

describe('groupSources', () => {
  const rows = [
    { ref: 'perez', referrer_host: null, visitors: 10, converters: 2 },
    { ref: 'perez', referrer_host: 'instagram.com', visitors: 5, converters: 1 },
    { ref: 'instagram', referrer_host: null, visitors: 4, converters: 0 },
    { ref: null, referrer_host: 'google.com', visitors: 20, converters: 1 },
    { ref: null, referrer_host: null, visitors: 8, converters: 0 },
  ];

  it('separa canales registrados, links sin registrar y sin link por sitio de origen', () => {
    const out = groupSources(rows, [ch('perez'), ch('garcia')]);
    expect(out.channels.map(c => [c.slug, c.visitors, c.converters])).toEqual([['perez', 15, 3], ['garcia', 0, 0]]);
    expect(out.channels[0].rate).toBe(0.2);
    expect(out.unregistered).toEqual([{ ref: 'instagram', visitors: 4, converters: 0 }]);
    expect(out.direct).toEqual([{ host: 'google.com', visitors: 20, converters: 1 }, { host: null, visitors: 8, converters: 0 }]);
  });

  it('canal archivado: sin tráfico en el período no aparece; con tráfico sí', () => {
    const archived = { archived_at: '2026-11-20T00:00:00Z' };
    expect(groupSources(rows, [ch('garcia', archived)]).channels).toEqual([]);
    expect(groupSources(rows, [ch('perez', archived)]).channels.map(c => c.slug)).toEqual(['perez']);
  });

  it('los números del RPC pueden venir como texto (bigint)', () => {
    const out = groupSources([{ ref: 'perez', referrer_host: null, visitors: '3' as unknown as number, converters: '1' as unknown as number }], [ch('perez')]);
    expect(out.channels[0]).toMatchObject({ visitors: 3, converters: 1 });
  });
});

describe('formatDuration', () => {
  it('segundos, minutos y vacío', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(42)).toBe('42 s');
    expect(formatDuration(95)).toBe('1 min 35 s');
    expect(formatDuration(120)).toBe('2 min');
  });
});

describe('sortUnitStats', () => {
  const u = (code: string, views: number, avg: number | null) => ({ unit_id: code, code, building_name: 'T', floor_number: 1, status: 'available', views, viewers: views, avg_seconds: avg, tours: 0, leads: 0 });
  it('por defecto más vistas primero; desempata por código', () => {
    expect(sortUnitStats([u('B', 3, 1), u('A', 3, 1), u('C', 9, 1)], 'views', 'desc').map(x => x.code)).toEqual(['C', 'A', 'B']);
  });
  it('tiempo promedio: los vacíos al final en cualquier sentido', () => {
    const rows = [u('A', 1, null), u('B', 1, 10), u('C', 1, 30)];
    expect(sortUnitStats(rows, 'avg_seconds', 'desc').map(x => x.code)).toEqual(['C', 'B', 'A']);
    expect(sortUnitStats(rows, 'avg_seconds', 'asc').map(x => x.code)).toEqual(['B', 'C', 'A']);
  });
  it('no muta el arreglo original', () => {
    const rows = [u('A', 1, 1), u('B', 2, 1)];
    sortUnitStats(rows, 'views', 'desc');
    expect(rows.map(x => x.code)).toEqual(['A', 'B']);
  });
});
