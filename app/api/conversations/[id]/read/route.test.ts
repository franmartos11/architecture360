import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const CONVO_ID = '11111111-1111-1111-1111-111111111111';
const params = () => Promise.resolve({ id: CONVO_ID });

function req() {
  return new Request(`http://localhost/api/conversations/${CONVO_ID}/read`, { method: 'POST' });
}

describe('POST /api/conversations/[id]/read', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('marca como leídos los mensajes del otro participante: success', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: null }], // .from('messages').update(...).eq(...).neq(...).is(...)
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(supabase.from).toHaveBeenCalledWith('messages');
  });

  it('error de la base: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { message: 'update failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req(), { params: params() });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });
});
