import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { DELETE } from './route';

function params(id = 'comment-1') {
  return { params: Promise.resolve({ id }) };
}
function req() {
  return new Request('http://localhost/api/comments/comment-1', { method: 'DELETE' });
}

describe('DELETE /api/comments/[id]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req(), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('borrado exitoso (autor o dueño del proyecto): 200', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: [{ id: 'comment-1' }], error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req(), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('RLS no afectó ninguna fila (ni autor ni dueño): 403', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: [], error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('No autorizado');
  });

  it('data null (mismo caso que array vacío): 403', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req(), params());
    expect(res.status).toBe(403);
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { message: 'delete failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req(), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});
