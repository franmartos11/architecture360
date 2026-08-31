import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function req() {
  return new Request('http://localhost/api/notifications/read', { method: 'POST' });
}

describe('POST /api/notifications/read', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST();

    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('marca TODAS las notificaciones no leídas del usuario como leídas', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: null }], // .from('notifications').update(...).eq('recipient_id',...).is('read_at', null)
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(supabase.from).toHaveBeenCalledWith('notifications');
  });

  it('error de la base: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { message: 'update failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST();

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});
