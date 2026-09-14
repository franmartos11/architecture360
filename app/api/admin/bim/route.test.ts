import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const URL_ = 'http://localhost/api/admin/bim';

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

describe('POST /api/admin/bim', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('sin título: 400', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const res = await POST(jsonRequest(URL_, { title: '   ' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el título.');
  });

  it('más imágenes que el tope: 400 con el número concreto', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const galleryImages = Array.from({ length: 31 }, (_, i) => `https://x/${i}.png`);
    const res = await POST(jsonRequest(URL_, { title: 'Casa', galleryImages }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('30');
  });

  it('pieza vacía: se crea en processing, no en ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ data: row({ status: 'processing' }) }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(201);
    expect((await res.json()).model.status).toBe('processing');
  });

  it('con imágenes: se crea directamente en ready', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({
      results: [{ data: row({ status: 'ready', gallery_images: ['https://x/1.png'] }) }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio', galleryImages: ['https://x/1.png'] }));
    expect(res.status).toBe(201);
    expect((await res.json()).model.status).toBe('ready');
    expect(supabase.from).toHaveBeenCalledWith('bim_models');
  });

  it('error de la base: 500 con el mensaje', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: null, error: { message: 'insert failed' } }] }) as never
    );
    const res = await POST(jsonRequest(URL_, { title: 'Casa Patio' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
