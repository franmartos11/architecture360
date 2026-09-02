import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/blocks', () => ({ isBlockedEitherWay: vi.fn().mockResolvedValue(false) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { isBlockedEitherWay } from '@/lib/blocks';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, POST, DELETE } from './route';

function params(handle = 'ana') {
  return { params: Promise.resolve({ handle }) };
}
function req(method: string) {
  return new Request('http://localhost/api/blocks/ana', { method });
}

describe('GET /api/blocks/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(isBlockedEitherWay).mockReset().mockResolvedValue(false);
  });

  it('sin sesión: canMessage true, sin tocar la base', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect(await res.json()).toEqual({ isBlockedByMe: false, canMessage: true });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('perfil no encontrado: canMessage true', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect(await res.json()).toEqual({ isBlockedByMe: false, canMessage: true });
  });

  it('lo tengo bloqueado: isBlockedByMe true, canMessage false', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { data: { blocker_id: 'me-1' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(isBlockedEitherWay).mockResolvedValue(true);

    const res = await GET(req('GET'), params());
    expect(await res.json()).toEqual({ isBlockedByMe: true, canMessage: false });
  });

  it('el otro me bloqueó a mí (yo no lo bloqueé): isBlockedByMe false, canMessage false igual', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(isBlockedEitherWay).mockResolvedValue(true);

    const res = await GET(req('GET'), params());
    expect(await res.json()).toEqual({ isBlockedByMe: false, canMessage: false });
  });
});

describe('POST /api/blocks/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }));

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('perfil objetivo no encontrado: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(404);
  });

  it('bloquearse a uno mismo: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: { id: 'me-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No podés bloquearte a vos mismo.');
  });

  it('bloqueo válido: inserta y devuelve isBlockedByMe/canMessage', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isBlockedByMe: true, canMessage: false });
  });

  it('insert 23505 (ya lo tenía bloqueado): se trata como éxito', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: { code: '23505', message: 'duplicate key' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isBlockedByMe: true, canMessage: false });
  });

  it('error real de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: { code: 'XX000', message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});

describe('DELETE /api/blocks/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(isBlockedEitherWay).mockReset().mockResolvedValue(false);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('perfil objetivo no encontrado: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(404);
  });

  it('desbloqueo válido: borra y devuelve canMessage true (nadie más bloqueó)', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isBlockedByMe: false, canMessage: true });
  });

  it('desbloqueo válido pero el otro TAMBIÉN me tenía bloqueado: canMessage sigue false', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(isBlockedEitherWay).mockResolvedValue(true);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ isBlockedByMe: false, canMessage: false });
  });
});
