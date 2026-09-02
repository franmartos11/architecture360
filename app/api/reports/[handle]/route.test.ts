import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

function params(handle = 'ana') {
  return { params: Promise.resolve({ handle }) };
}
function post(body: unknown, handle = 'ana') {
  return jsonRequest(`http://localhost/api/reports/${handle}`, body);
}

describe('POST /api/reports/[handle]', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: 'me acosa' }), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, antes de tocar la base', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }));

    const res = await POST(post({ reason: 'me acosa' }), params());
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('reason vacío: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: '   ' }), params());
    expect(res.status).toBe(400);
  });

  it('perfil objetivo no encontrado: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: 'me acosa' }), params());
    expect(res.status).toBe(404);
  });

  it('denunciarse a uno mismo: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: { id: 'me-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: 'me acosa' }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No podés denunciarte a vos mismo.');
  });

  it('denuncia válida: inserta y devuelve 201', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: 'me acosa', entityId: 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab' }), params());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('error de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'target-1' } }, { error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ reason: 'me acosa' }), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });
});
