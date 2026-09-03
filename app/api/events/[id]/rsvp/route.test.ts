import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST, DELETE } from './route';

const EVENT_ID = 'event-1';

function req(method: string) {
  return new Request(`http://localhost/api/events/${EVENT_ID}/rsvp`, { method });
}
function ctx() {
  return { params: Promise.resolve({ id: EVENT_ID }) };
}

describe('POST /api/events/[id]/rsvp', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(401);
  });

  it('feliz: confirma asistencia', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('rsvp idempotente (23505): success:true', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { code: '23505', message: 'duplicate key' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});

describe('DELETE /api/events/[id]/rsvp', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(401);
  });

  it('feliz: cancela asistencia', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
