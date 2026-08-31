import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromFloor: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromFloor } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/floors/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('piso inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/no-existe', { label: 'x' }), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'x' }), params('floor-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'update failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'Nuevo' }), params('floor-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });

  it('actualización válida: solo manda los campos presentes en el body', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'floor-1', label: 'Nuevo' }, error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/floors/floor-1', { label: 'Nuevo' }), params('floor-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'floor-1', label: 'Nuevo' });
  });
});

describe('DELETE /api/admin/floors/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromFloor).mockReset();
  });

  it('piso inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue(null);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/no-existe'), params('no-existe'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(401);
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });

  it('borrado válido: 200 con success true', async () => {
    vi.mocked(resolveProjectIdFromFloor).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/floors/floor-1'), params('floor-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
