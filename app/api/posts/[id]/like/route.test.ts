import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST, DELETE } from './route';

const POST_ID = 'post-1';

function req(method: string) {
  return new Request(`http://localhost/api/posts/${POST_ID}/like`, { method });
}
function ctx() {
  return { params: Promise.resolve({ id: POST_ID }) };
}

describe('POST /api/posts/[id]/like', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(401);
  });

  it('rate limit alcanzado: devuelve el 429 tal cual, sin insertar', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Too many' }, { status: 429 }));

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('feliz: inserta el like y notifica al autor del post', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { error: null }, // .from('post_likes').insert(...)
        { data: { author_id: 'post-author' } }, // .from('posts')...maybeSingle()
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(notify).toHaveBeenCalledWith(supabase, {
      recipientId: 'post-author',
      actorId: 'user-1',
      type: 'like',
      entityId: POST_ID,
    });
  });

  it('like idempotente (23505 — ya lo tenía likeado): success:true, no notifica de nuevo', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { code: '23505', message: 'duplicate key' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(notify).not.toHaveBeenCalled();
    expect(supabase.from).toHaveBeenCalledTimes(1);
  });

  it('error real de la base (no 23505): 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { code: '500', message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('post no encontrado: success:true, no notifica', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: null }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/posts/[id]/like', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(401);
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { message: 'delete failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(500);
  });

  it('feliz: quita el like', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
