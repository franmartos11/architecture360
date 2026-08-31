import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));
vi.mock('@/data/project-repository', () => ({ getProjectBySlug: vi.fn() }));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { getProjectBySlug } from '@/data/project-repository';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/admin/project/preview', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
    vi.mocked(getProjectBySlug).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project/preview'));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await GET(get('http://localhost/api/admin/project/preview'));
    expect(res.status).toBe(401);
    expect(getProjectBySlug).not.toHaveBeenCalled();
  });

  it('fila de proyecto no encontrada (borrado entre medio): 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(get('http://localhost/api/admin/project/preview'));
    expect(res.status).toBe(404);
    expect(getProjectBySlug).not.toHaveBeenCalled();
  });

  it('getProjectBySlug no encuentra nada (slug desincronizado): 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { slug: 'torre-del-mar' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    vi.mocked(getProjectBySlug).mockResolvedValue(undefined);

    const res = await GET(get('http://localhost/api/admin/project/preview'));
    expect(res.status).toBe(404);
    expect(getProjectBySlug).toHaveBeenCalledWith('torre-del-mar');
  });

  it('camino feliz: devuelve el Project completo con el mismo shape que la landing pública', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { slug: 'torre-del-mar' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const fakeProject = {
      id: 'project-1',
      slug: 'torre-del-mar',
      name: 'Torre del Mar',
      buildings: [],
      amenities: [],
      pointsOfInterest: [],
      collaborators: [],
      aerialSlides: [],
    };
    vi.mocked(getProjectBySlug).mockResolvedValue(fakeProject as never);

    const res = await GET(get('http://localhost/api/admin/project/preview'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ project: fakeProject });
  });
});
