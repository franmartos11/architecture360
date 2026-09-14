import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({ requireProjectAccess: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

function req(id: string) {
  return new Request(`http://localhost/api/admin/projects/${id}/bim-count`);
}

describe('GET /api/admin/projects/[id]/bim-count', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(req('project-1'), params('project-1'));
    expect(res.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('separa las piezas propias de las de otros colaboradores', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({
      results: [{ data: [{ author_id: 'user-1' }, { author_id: 'user-1' }, { author_id: 'otro' }] }],
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 2, other: 1 });
  });

  it('proyecto sin piezas: ceros', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const admin = mockSupabase({ results: [{ data: [] }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 0, other: 0 });
  });

  it('cuenta piezas privadas o todavía en processing de otros colaboradores (invisibles con RLS de sesión)', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    // Con el cliente de sesión, una pieza privada o en processing/failed de
    // otro autor no pasaría las policies de RLS de bim_models y ni
    // aparecería en `data`. El cliente admin (createAdminClient) sí la ve,
    // que es justo lo que hace posible este conteo.
    const admin = mockSupabase({
      results: [{ data: [{ author_id: 'user-1' }, { author_id: 'otro-privado' }, { author_id: 'otro-processing' }] }],
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET(req('project-1'), params('project-1'));
    expect(await res.json()).toEqual({ own: 1, other: 2 });
  });
});
