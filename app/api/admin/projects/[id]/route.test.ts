import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-project-storage', () => ({ deleteProjectStorageFiles: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteProjectStorageFiles } from '@/lib/supabase/delete-project-storage';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
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
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
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
    const admin = mockSupabase({ results: [{ data: [] }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(deleteProjectStorageFiles).toHaveBeenCalledWith(admin, 'project-1');
    expect(admin.from).toHaveBeenCalledTimes(3);
  });

  it('error de la base al borrar el proyecto: 500 con el mensaje', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ data: [] }, { error: null }, { error: { message: 'delete failed' } }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});

describe('DELETE /api/admin/projects/[id] — limpieza de piezas BIM', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteProjectStorageFiles).mockReset().mockResolvedValue(undefined);
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos de Storage de TODAS las piezas del proyecto, sin preguntar', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const bimRows = [
      { id: 'bim-1', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: ['https://x/1.png'] },
      { id: 'bim-2', geometry_url: null, properties_url: null, cover_image: null, source_url: null, gallery_images: [] },
    ];
    // .from(): bim_models (lectura), leads, projects
    const admin = mockSupabase({ results: [{ data: bimRows }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledWith(admin, bimRows);
  });

  it('proyecto sin piezas BIM: no llama al borrado de archivos', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ data: [] }, { error: null }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(req('project-1'), params('project-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
