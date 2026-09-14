import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/supabase/delete-bim-storage', () => ({ deleteBimStorageFiles: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteBimStorageFiles } from '@/lib/supabase/delete-bim-storage';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: 'bim-1', author_id: 'user-1', project_id: null, title: 'Casa Patio',
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
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(401);
  });

  it('pieza de otro autor (RLS la oculta): 404', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await PATCH(jsonRequest(URL_, { title: 'X' }, { method: 'PATCH' }), params('bim-1'));
    expect(res.status).toBe(404);
  });

  it('agregar la primera imagen a una pieza vacía la pasa a ready y le pone portada', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [
        { data: row() },                                                                  // lectura previa
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) }, // update
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(
      jsonRequest(URL_, { galleryImages: ['https://x/1.png'] }, { method: 'PATCH' }),
      params('bim-1')
    );
    expect(res.status).toBe(200);
    const { model } = await res.json();
    expect(model.status).toBe('ready');
    expect(model.coverImage).toBe('https://x/1.png');
  });

  it('sacar la última imagen de una pieza sin modelo la devuelve a processing', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [
        { data: row({ status: 'ready', gallery_images: ['https://x/1.png'], cover_image: 'https://x/1.png' }) },
        { data: row({ status: 'processing', gallery_images: [], cover_image: null }) },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con modelo cargado, sacar todas las imágenes NO la saca de ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const withModel = row({ status: 'ready', geometry_url: 'https://x/m.frag', gallery_images: ['https://x/1.png'] });
    const supabase = mockSupabase({
      results: [{ data: withModel }, { data: { ...withModel, gallery_images: [] } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(jsonRequest(URL_, { galleryImages: [] }, { method: 'PATCH' }), params('bim-1'));
    expect((await res.json()).model.status).toBe('ready');
  });
});

describe('DELETE /api/admin/bim/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(deleteBimStorageFiles).mockReset().mockResolvedValue(undefined);
  });

  it('borra los archivos ANTES que la fila', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [{ data: row({ gallery_images: ['https://x/1.png'] }) }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({});
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(200);
    expect(deleteBimStorageFiles).toHaveBeenCalledTimes(1);
  });

  it('pieza inexistente o ajena: 404, no borra archivos', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    const res = await DELETE(new Request(URL_, { method: 'DELETE' }), params('bim-1'));
    expect(res.status).toBe(404);
    expect(deleteBimStorageFiles).not.toHaveBeenCalled();
  });
});
