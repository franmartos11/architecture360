import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id: string) {
  return new Request(`http://localhost/api/admin/projects/${id}/bim-count`);
}

describe('GET /api/admin/projects/[id]/bim-count', () => {
  beforeEach(() => vi.mocked(requireProjectAccess).mockReset());

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(req('project-1'), params('project-1'));
    expect(res.status).toBe(401);
  });

  it('separa las piezas propias de las de otros colaboradores', async () => {
    const supabase = mockSupabase({
      results: [{ data: [{ author_id: 'user-1' }, { author_id: 'user-1' }, { author_id: 'otro' }] }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 2, other: 1 });
  });

  it('proyecto sin piezas: ceros', async () => {
    const supabase = mockSupabase({ results: [{ data: [] }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 0, other: 0 });
  });
});
