import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromSlide: vi.fn(),
}));

import { requireProjectAccess, resolveProjectIdFromSlide } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH, DELETE } from './route';

function del(url: string) {
  return new Request(url, { method: 'DELETE' });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/admin/aerial-slides/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromSlide).mockReset();
  });

  it('vista aérea inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-slides/slide-1', { label: 'Nueva' }, { method: 'PATCH' }),
      ctx('slide-1')
    );
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-slides/slide-1', { label: 'Nueva' }, { method: 'PATCH' }),
      ctx('slide-1')
    );
    expect(res.status).toBe(401);
  });

  it('videoUrl vacío se guarda como null, y solo se actualizan las claves presentes', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    const updateSpy = vi.fn((_payload: Record<string, unknown>) => ({
      eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'slide-1' }, error: null }) }) }),
    }));
    const supabase = { from: vi.fn(() => ({ update: updateSpy })) };
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/aerial-slides/slide-1',
        { videoUrl: '', label: 'Vista sur' },
        { method: 'PATCH' }
      ),
      ctx('slide-1')
    );

    expect(res.status).toBe(200);
    const updatePayload = updateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(updatePayload).toEqual({ video_url: null, label: 'Vista sur' });
  });

  it('actualización válida de imageUrl y sortOrder: 200', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'slide-1', sort_order: 2 } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest(
        'http://localhost/api/admin/aerial-slides/slide-1',
        { imageUrl: 'https://example.com/new.jpg', sortOrder: 2 },
        { method: 'PATCH' }
      ),
      ctx('slide-1')
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'slide-1', sort_order: 2 });
  });

  it('error de la base al actualizar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await PATCH(
      jsonRequest('http://localhost/api/admin/aerial-slides/slide-1', { label: 'Nueva' }, { method: 'PATCH' }),
      ctx('slide-1')
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});

describe('DELETE /api/admin/aerial-slides/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromSlide).mockReset();
  });

  it('vista aérea inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/aerial-slides/slide-1'), ctx('slide-1'));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await DELETE(del('http://localhost/api/admin/aerial-slides/slide-1'), ctx('slide-1'));
    expect(res.status).toBe(401);
  });

  it('con acceso: borra (cascade se lleva los hotspots) y devuelve success', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/aerial-slides/slide-1'), ctx('slide-1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('error de la base al borrar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await DELETE(del('http://localhost/api/admin/aerial-slides/slide-1'), ctx('slide-1'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
