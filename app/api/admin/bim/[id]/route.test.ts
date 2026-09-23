import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({
  resolveProjectIdFromBimModel: vi.fn(),
  requireProjectAccess: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { resolveProjectIdFromBimModel, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', project_id: 'project-1', title: 'Casa Patio',
    description: null, source_format: null, source_url: null, geometry_url: null,
    properties_url: null, gallery_images: [], cover_image: null, stats: null,
    status: 'processing', error_message: null, is_public: true,
    created_at: '2026-09-14T10:00:00Z', updated_at: '2026-09-14T10:00:00Z',
    ...over,
  };
}

const URL_ = 'http://localhost/api/admin/bim/bim-1';

describe('PATCH /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromBimModel).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('pieza inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('pieza de un proyecto ajeno: 401', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(401);
  });

  it('agregar la primera imagen a una pieza vacía la pasa a ready y le pone portada', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      // 3 lecturas a bim_models: la fila actual, el update, y la re-lectura
      // final que trae los joins con floors/units (de ahí sale la respuesta).
      results: [
        { data: row() },
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) },
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(200);
    const { model } = await res.json();
    expect(model.status).toBe('ready');
    expect(model.coverImage).toBe('https://x/1.png');
  });

  it('un proyectId en el body se ignora — la pieza no se puede reasociar', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: row() }, { data: row({ title: 'Nuevo título' }) }, { data: row({ title: 'Nuevo título' }) }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);

    const res = await PATCH(
      jsonRequest(URL_, { title: 'Nuevo título', projectId: 'otro-proyecto' }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(200);
    expect((await res.json()).model.projectId).toBe('project-1');
  });
});

describe('DELETE /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(resolveProjectIdFromBimModel).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos ANTES que la fila', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: row({ gallery_images: ['https://x/1.png'] }) }, { error: null }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ user: { id: 'user-1' }, supabase } as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledTimes(1);
  });

  it('pieza inexistente: 404, no borra archivos', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue(null);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });

  it('pieza de un proyecto ajeno: 401', async () => {
    vi.mocked(resolveProjectIdFromBimModel).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(401);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
