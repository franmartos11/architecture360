import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { DELETE } from './route';

const POST_ID = 'post-1';

function del() {
  return new Request(`http://localhost/api/posts/${POST_ID}`, { method: 'DELETE' });
}
function ctx() {
  return { params: Promise.resolve({ id: POST_ID }) };
}

describe('DELETE /api/posts/[id]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(401);
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null, error: { message: 'delete failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(500);
  });

  it('no es el dueño del post (RLS no afectó filas): 403', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(403);
  });

  it('feliz: borra su propio post', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: [{ id: POST_ID }] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(del(), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
