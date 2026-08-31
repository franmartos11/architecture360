import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromPoi: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromPoi } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/points-of-interest/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromPoi).mockReset();
  });

  it('punto de interés inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/points-of-interest/no-existe', { name: 'x' }), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1', { name: 'x' }), params('poi-1'));
    expect(res.status).toBe(401);
  });

  it('category inválida: 400', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1', { category: 'inventado' }), params('poi-1'));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1', { name: 'Nuevo' }), params('poi-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });

  it('actualización válida: 200 con la fila actualizada', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'poi-1', name: 'Nuevo' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1', { name: 'Nuevo' }), params('poi-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'poi-1', name: 'Nuevo' });
  });
});

describe('DELETE /api/admin/points-of-interest/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromPoi).mockReset();
  });

  it('punto de interés inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue(null);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/points-of-interest/no-existe'), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1'), params('poi-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1'), params('poi-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });

  it('borrado válido: 200 con success true', async () => {
    vi.mocked(resolveProjectIdFromPoi).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/points-of-interest/poi-1'), params('poi-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
