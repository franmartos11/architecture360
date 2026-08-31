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
});
