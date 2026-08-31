import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/conversations/unread-count', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: count 0, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('usuario sin conversaciones: count 0, no llega a consultar mensajes', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: [] }], // .from('conversations')
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('usuario con conversaciones: suma los mensajes no leídos que no mandó él', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ id: 'convo-1' }, { id: 'convo-2' }] }, // .from('conversations')
        { count: 4 }, // .from('messages')...head:true
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 4 });
  });

  it('error en la consulta de mensajes: degrada a count 0', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ id: 'convo-1' }] },
        { count: null, error: { message: 'db down' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ count: 0 });
  });
});
