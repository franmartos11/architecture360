import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

const SUMMARY = { visitors: 40, sessions: 55, unit_viewers: 20, tour_viewers: 8, web_converters: 4, web_leads: 3, whatsapp_clickers: 2, other_leads: 5, mobile_visitors: 30, desktop_visitors: 10 };

describe('GET /api/admin/metrics', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('p1');
  });

  it('sin rol de gestor: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(new Request('http://localhost/api/admin/metrics'));
    expect(res.status).toBe(401);
  });

  it('arma resumen con tasa, unidades y orígenes; pasa el período a las funciones', async () => {
    const sb = mockSupabase({
      results: [{ data: [{ id: 'c1', name: 'Pérez', slug: 'perez', kind: 'inmobiliaria', archived_at: null, created_at: 'x' }] }],
      rpc: [
        { data: SUMMARY },
        { data: [{ unit_id: 'u1', code: 'A01', building_name: 'Torre', floor_number: 1, status: 'available', views: 9, viewers: 7, avg_seconds: 42, tours: 3, leads: 1 }] },
        { data: [{ ref: 'perez', referrer_host: null, visitors: 10, converters: 2 }, { ref: null, referrer_host: 'google.com', visitors: 30, converters: 2 }] },
        { data: ['perez'] },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: sb, user: { id: 'u' } } as never);

    const res = await GET(new Request('http://localhost/api/admin/metrics?range=all'));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.range).toBe('all');
    expect(body.summary).toMatchObject({ visitors: 40, rate: 0.1 });
    expect(body.units).toHaveLength(1);
    expect(body.sources.channels[0]).toMatchObject({ slug: 'perez', visitors: 10, has_traffic: true });
    expect(body.sources.direct).toEqual([{ host: 'google.com', visitors: 30, converters: 2 }]);
    expect(sb.rpc).toHaveBeenCalledWith('site_metrics_summary', { p_project_id: 'p1', p_since: '-infinity' });
  });

  it('error de una función (SQL todavía sin correr): 500 con mensaje genérico', async () => {
    const sb = mockSupabase({ results: [{ data: [] }], rpc: [{ error: { message: 'function does not exist' } }, { data: [] }, { data: [] }, { data: [] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: sb, user: { id: 'u' } } as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(new Request('http://localhost/api/admin/metrics'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).not.toContain('function');
  });
});
