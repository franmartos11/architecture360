import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/collaborators/mine', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('con sesión: devuelve las colaboraciones propias', async () => {
    const rows = [
      { id: 'collab-1', status: 'accepted', project: { slug: 'torre', name: 'Torre del Mar', masterplan_image: null } },
    ];
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: rows, error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ collaborations: rows });
  });

  it('data null: devuelve lista vacía', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ collaborations: [] });
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('boom');
  });
});
