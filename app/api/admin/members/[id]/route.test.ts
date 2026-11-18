import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromMember: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromMember } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

const params = { params: Promise.resolve({ id: 'm1' }) };
const patchReq = (body: unknown) => jsonRequest('http://localhost/api/admin/members/m1', body, { method: 'PATCH' });
const delReq = () => jsonRequest('http://localhost/api/admin/members/m1', undefined, { method: 'DELETE' });

function grant(supabase: unknown, role: string) {
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' }, role } as never);
}

describe('PATCH /api/admin/members/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromMember).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('miembro inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromMember).mockResolvedValue(null);
    expect((await PATCH(patchReq({ role: 'editor' }), params)).status).toBe(404);
  });

  it('rol inválido: 400', async () => {
    grant(mockSupabase(), 'dueño');
    expect((await PATCH(patchReq({ role: 'dueño' }), params)).status).toBe(400);
  });

  it('administrador sobre fila de administrador: 403', async () => {
    grant(mockSupabase({ results: [{ data: { role: 'administrador' } }] }), 'administrador');
    expect((await PATCH(patchReq({ role: 'editor' }), params)).status).toBe(403);
  });

  it('administrador ascendiendo a administrador: 403', async () => {
    grant(mockSupabase({ results: [{ data: { role: 'editor' } }] }), 'administrador');
    expect((await PATCH(patchReq({ role: 'administrador' }), params)).status).toBe(403);
  });

  it('dueño cambia rol: 200', async () => {
    const row = { id: 'm1', role: 'gestor' };
    grant(mockSupabase({ results: [{ data: { role: 'editor' } }, { data: row }] }), 'dueño');
    const res = await PATCH(patchReq({ role: 'gestor' }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(row);
  });

  it('trigger 42501: 403', async () => {
    grant(
      mockSupabase({ results: [{ data: { role: 'editor' } }, { data: null, error: { code: '42501', message: 'x' } }] }),
      'dueño',
    );
    expect((await PATCH(patchReq({ role: 'gestor' }), params)).status).toBe(403);
  });
});

describe('DELETE /api/admin/members/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromMember).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('miembro inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromMember).mockResolvedValue(null);
    expect((await DELETE(delReq(), params)).status).toBe(404);
  });

  it('administrador sobre fila de administrador: 403', async () => {
    grant(mockSupabase({ results: [{ data: { role: 'administrador' } }] }), 'administrador');
    expect((await DELETE(delReq(), params)).status).toBe(403);
  });

  it('dueño quita a un miembro: 200', async () => {
    grant(mockSupabase({ results: [{ data: { role: 'editor' } }, { error: null }] }), 'dueño');
    expect((await DELETE(delReq(), params)).status).toBe(200);
  });

  it('trigger 42501: 403', async () => {
    grant(
      mockSupabase({ results: [{ data: { role: 'editor' } }, { error: { code: '42501', message: 'x' } }] }),
      'dueño',
    );
    expect((await DELETE(delReq(), params)).status).toBe(403);
  });
});
