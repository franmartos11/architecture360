import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { imageUrl: 'https://example.com/aerial.jpg', label: 'Vista norte' };

describe('POST /api/admin/aerial-slides', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  it('proyecto no encontrado: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-slides', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-slides', VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('falta imageUrl: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-slides', { label: 'Vista norte' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('label no es string: 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(
      jsonRequest('http://localhost/api/admin/aerial-slides', { imageUrl: 'https://example.com/x.jpg', label: 123 })
    );
    expect(res.status).toBe(400);
  });

  it('alta válida: inserta con project_id, video_url null y sort_order 0 por defecto', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'slide-1', label: 'Vista norte' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-slides', VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'slide-1', label: 'Vista norte' });
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-slides', VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
