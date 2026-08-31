import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { name: 'Colegio San José', category: 'colegio' };

describe('POST /api/admin/points-of-interest', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('proyecto no encontrado: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('falta name: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { category: 'colegio' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('category inválida: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { name: 'x', category: 'inventado' }));
    expect(res.status).toBe(400);
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('alta válida: inserta y devuelve 201 con la fila creada', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'poi-1', name: 'Colegio San José', category: 'colegio' }, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'poi-1', name: 'Colegio San José', category: 'colegio' });
  });

  it('sin category: usa "otro" por default', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { id: 'poi-1', name: 'Plaza', category: 'otro' }, error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/points-of-interest', { name: 'Plaza' }));
    expect(res.status).toBe(201);
  });
});
