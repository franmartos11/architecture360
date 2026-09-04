import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/posts/attachable-projects', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });

  it('feliz: mapea a camelCase y marca hasTour a partir de common_areas_tour', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        {
          data: [
            { id: 'p1', slug: 'torre-a', name: 'Torre A', location: 'Rosario', masterplan_image: 'x.png', published: true, common_areas_tour: { nodes: [] } },
            { id: 'p2', slug: 'torre-b', name: 'Torre B', location: null, masterplan_image: null, published: false, common_areas_tour: null },
          ],
        },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      projects: [
        { id: 'p1', slug: 'torre-a', name: 'Torre A', location: 'Rosario', masterplanImage: 'x.png', published: true, hasTour: true },
        { id: 'p2', slug: 'torre-b', name: 'Torre B', location: null, masterplanImage: null, published: false, hasTour: false },
      ],
    });
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
