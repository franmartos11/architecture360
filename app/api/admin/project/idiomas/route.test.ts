import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { PATCH } from './route';

const req = (body: unknown) =>
  new Request('http://localhost/api/admin/project/idiomas?projectId=p1', { method: 'PATCH', body: JSON.stringify(body) });

describe('PATCH /api/admin/project/idiomas', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('p1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    expect((await PATCH(req({ ingles: true }))).status).toBe(404);
  });

  it('activar el inglés es de administrador en adelante, y revalida el sitio', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await PATCH(req({ ingles: true }))).status).toBe(401);
    expect(requireProjectAccess).toHaveBeenCalledWith('p1', { minRole: 'administrador', revalidate: true });
  });

  it('cuerpo inválido: 400', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }) } as never);
    expect((await PATCH(req({ ingles: 'si' }))).status).toBe(400);
  });

  it.each([
    [true, ['es', 'en']],
    [false, ['es']],
  ])('ingles: %s → guarda %j', async (ingles, locales) => {
    const supabase = mockSupabase({ results: [{ data: { locales } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase } as never);
    const res = await PATCH(req({ ingles }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ locales });
    const q = supabase.from.mock.results[0].value;
    expect(supabase.from).toHaveBeenCalledWith('projects');
    expect(q.update).toHaveBeenCalledWith({ locales });
    expect(q.eq).toHaveBeenCalledWith('id', 'p1');
  });
});
