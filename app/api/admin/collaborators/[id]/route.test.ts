import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromCollaborator: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromCollaborator } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/collaborators/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromCollaborator).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('colaborador inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromCollaborator).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', { contribution: 'algo' }), params('x'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', { contribution: 'algo' }), params('x'));
    expect(res.status).toBe(401);
  });

  it('actualiza contribution y ya estaba accepted: vuelve a pending', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { status: 'accepted' } }, // select status
        { data: { id: 'x', status: 'pending', contribution: 'nuevo texto' }, error: null }, // update().select().single()
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', { contribution: 'nuevo texto' }), params('x'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'x', status: 'pending', contribution: 'nuevo texto' });
  });

  it('actualiza contribution y no estaba accepted: no toca el status', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { status: 'pending' } },
        { data: { id: 'x', status: 'pending' }, error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', { contribution: 'algo' }), params('x'));
    expect(res.status).toBe(200);
  });

  it('sin campo contribution: no consulta el status actual, solo actualiza', async () => {
    const supabase = mockSupabase({
      results: [{ data: { id: 'x' }, error: null }], // update().select().single() directo
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', {}), params('x'));
    expect(res.status).toBe(200);
  });

  it('error de la base al actualizar: 500', async () => {
    const supabase = mockSupabase({
      results: [{ data: null, error: { message: 'update failed' } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(jsonRequest('http://localhost/api/admin/collaborators/x', {}), params('x'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});

describe('DELETE /api/admin/collaborators/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromCollaborator).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('colaborador inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromCollaborator).mockResolvedValue(null);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/collaborators/x'), params('x'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/collaborators/x'), params('x'));
    expect(res.status).toBe(401);
  });

  it('elimina correctamente: 200', async () => {
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/collaborators/x'), params('x'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al eliminar: 500', async () => {
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/collaborators/x'), params('x'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});
