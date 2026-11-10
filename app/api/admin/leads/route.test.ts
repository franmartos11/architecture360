import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/leads', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('sin proyecto activo: 404, sin chequear acceso', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/leads'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto activo: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/leads'));
    expect(res.status).toBe(401);
  });

  it('con acceso: devuelve los leads del proyecto activo', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: [{ id: 'lead-1' }, { id: 'lead-2' }] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/leads'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: 'lead-1' }, { id: 'lead-2' }]);
  });

  it('sin leads todavía: []', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/leads'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('error de la base: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'db down' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/leads'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('db down');
  });

  describe('?count=1&since=', () => {
    function withCount(count: number | null, error: unknown = null) {
      vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
      const supabase = mockSupabase({ results: [{ count, error }] });
      vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
      return supabase;
    }

    it('devuelve solo el conteo (no la lista) de leads posteriores a since', async () => {
      const supabase = withCount(4);
      const since = new Date('2026-01-01T12:00:00Z').getTime();

      const res = await GET(get(`http://localhost/api/admin/leads?count=1&since=${since}`));

      expect(await res.json()).toEqual({ count: 4 });
      const chain = supabase.from.mock.results[0].value;
      expect(chain.select).toHaveBeenCalledWith('id', { count: 'exact', head: true });
      expect(chain.eq).toHaveBeenCalledWith('project_id', 'project-1');
      expect(chain.gt).toHaveBeenCalledWith('created_at', '2026-01-01T12:00:00.000Z');
    });

    it('since ausente o basura: cuenta desde el principio de los tiempos, no tira', async () => {
      const supabase = withCount(0);
      const res = await GET(get('http://localhost/api/admin/leads?count=1&since=abc'));
      expect(res.status).toBe(200);
      expect(supabase.from.mock.results[0].value.gt).toHaveBeenCalledWith('created_at', '1970-01-01T00:00:00.000Z');
    });

    it('count null (sin filas) se informa como 0', async () => {
      withCount(null);
      expect(await (await GET(get('http://localhost/api/admin/leads?count=1'))).json()).toEqual({ count: 0 });
    });

    it('error de la base: 500 genérico, sin filtrar el mensaje', async () => {
      withCount(null, { message: 'relation "leads" does not exist' });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await GET(get('http://localhost/api/admin/leads?count=1'));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain('relation');
    });
  });
});
