import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { POST, DELETE } from './route';

const POST_ID = 'post-1';

function req(method: string) {
  return new Request(`http://localhost/api/posts/${POST_ID}/save`, { method });
}
function ctx() {
  return { params: Promise.resolve({ id: POST_ID }) };
}

describe('POST /api/posts/[id]/save', () => {
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

  it('rate limit alcanzado: devuelve el 429 tal cual, sin insertar', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Too many' }, { status: 429 }));

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('feliz: guarda el post', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });

  it('guardado idempotente (23505 — ya lo tenía guardado): success:true', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { code: '23505', message: 'duplicate key' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
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
});

describe('DELETE /api/posts/[id]/save', () => {
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

  it('feliz: quita el guardado', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
