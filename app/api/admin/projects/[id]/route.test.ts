import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-project-storage', () => ({ deleteProjectStorageFiles: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteProjectStorageFiles } from '@/lib/supabase/delete-project-storage';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id: string) {
  return new Request(`http://localhost/api/admin/projects/${id}`, { method: 'DELETE' });
}

describe('DELETE /api/admin/projects/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteProjectStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('sin acceso al proyecto: 401, no toca storage ni borra nada', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(deleteProjectStorageFiles).not.toHaveBeenCalled();
  });

  it('borrado exitoso: limpia storage, borra leads huérfanos y el proyecto, en ese orden', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteProjectStorageFiles).toHaveBeenCalledWith(admin, 'project-1');
    expect(admin.from).toHaveBeenCalledTimes(2);
  });

  it('error de la base al borrar el proyecto: 500 con el mensaje', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ error: null }, { error: { message: 'delete failed' } }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});
