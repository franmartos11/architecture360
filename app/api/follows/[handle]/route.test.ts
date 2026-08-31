import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, POST, DELETE } from './route';

function params(handle = 'ana') {
  return { params: Promise.resolve({ handle }) };
}
function req(method: string) {
  return new Request('http://localhost/api/follows/ana', { method });
}

const TARGET = { id: 'target-1', display_name: 'Ana', avatar_image: null, bio: 'bio', account_type: 'agent' };

describe('GET /api/follows/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('perfil no encontrado: 404', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect(res.status).toBe(404);
  });

  it('anónimo: devuelve contadores públicos, isFollowedByMe false, sin consultar mi perfil', async () => {
    const supabase = mockSupabase({
      results: [{ data: TARGET }, { count: 3 }, { count: 5 }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      handle: 'ana',
      displayName: 'Ana',
      avatarImage: null,
      bio: 'bio',
      accountType: 'agent',
      followerCount: 3,
      followingCount: 5,
      isFollowedByMe: false,
    });
  });

  it('logueado, ya sigue al perfil: isFollowedByMe true', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: TARGET },
        { count: 3 },
        { count: 5 },
        { data: { id: 'me-1' } }, // mi perfil
        { data: { follower_id: 'me-1' } }, // ya sigue
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect((await res.json()).isFollowedByMe).toBe(true);
  });

  it('logueado pero sin perfil propio: isFollowedByMe false, no consulta follows', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: TARGET }, { count: 0 }, { count: 0 }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(req('GET'), params());
    expect((await res.json()).isFollowedByMe).toBe(false);
  });
});

describe('POST /api/follows/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }));

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sin portfolio propio: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Creá tu portfolio antes de seguir a alguien.');
  });

  it('perfil objetivo no encontrado: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: { id: 'me-1' } }, { data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(404);
  });

  it('seguirse a uno mismo: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'me-1' } }, { data: { id: 'me-1' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No podés seguirte a vos mismo.');
  });

  it('seguir válido: inserta, notifica y devuelve el conteo actualizado', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'target-1' } },
        { error: null }, // insert
        { count: 7 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ followerCount: 7, isFollowedByMe: true });
    expect(notify).toHaveBeenCalledWith(supabase, { recipientId: 'target-1', actorId: 'me-1', type: 'follow' });
  });

  it('insert 23505 (ya lo seguía): se trata como éxito, no como error', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'target-1' } },
        { error: { code: '23505', message: 'duplicate key' } },
        { count: 7 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ followerCount: 7, isFollowedByMe: true });
    expect(notify).toHaveBeenCalled();
  });

  it('error real de la base al insertar: 500, no notifica', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'target-1' } },
        { error: { code: 'XX000', message: 'insert failed' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req('POST'), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('DELETE /api/follows/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('mi perfil o el objetivo no existen: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }, { data: { id: 'target-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(404);
  });

  it('dejar de seguir válido: borra y devuelve el conteo actualizado', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'target-1' } },
        { error: null }, // delete
        { count: 2 },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(req('DELETE'), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ followerCount: 2, isFollowedByMe: false });
  });
});
