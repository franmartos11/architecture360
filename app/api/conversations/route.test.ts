import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

function postReq(body: unknown) {
  return jsonRequest('http://localhost/api/conversations', body);
}

describe('GET /api/conversations', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: devuelve lista vacía (no 401)', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sin conversaciones: no consulta mensajes', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: [], error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
  });

  it('error en la query principal: swallow, devuelve lista vacía (no 500)', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ conversations: [] });
  });

  it('con conversaciones: arma "other" según quién soy, último mensaje y no-leídos', async () => {
    const other1 = { id: 'p2', handle: 'beto', display_name: 'Beto', avatar_image: null };
    const other2 = { id: 'p3', handle: 'caro', display_name: 'Caro', avatar_image: null };
    const rows = [
      { id: 'conv-1', participant_one: 'me-1', participant_two: 'p2', last_message_at: '2026-01-02T00:00:00Z', one: null, two: other1 },
      { id: 'conv-2', participant_one: 'p3', participant_two: 'me-1', last_message_at: '2026-01-01T00:00:00Z', one: other2, two: null },
    ];
    const lastMessages = [
      { conversation_id: 'conv-1', body: 'hola', sender_id: 'p2', created_at: '2026-01-02T00:00:00Z' },
      { conversation_id: 'conv-2', body: 'hey', sender_id: 'me-1', created_at: '2026-01-01T00:00:00Z' },
    ];
    const unreadRows = [{ conversation_id: 'conv-1' }, { conversation_id: 'conv-1' }];
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: rows, error: null }, { data: lastMessages }, { data: unreadRows }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      conversations: [
        { id: 'conv-1', other: other1, lastMessage: lastMessages[0], unreadCount: 2, lastMessageAt: '2026-01-02T00:00:00Z' },
        { id: 'conv-2', other: other2, lastMessage: lastMessages[1], unreadCount: 0, lastMessageAt: '2026-01-01T00:00:00Z' },
      ],
    });
  });
});

describe('POST /api/conversations', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('handle inválido: 400 antes de rate-limitear', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'AB' }));
    expect(res.status).toBe(400);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate-limit alcanzado: devuelve el 429 tal cual, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Demasiadas solicitudes' }, { status: 429 }));

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('sin portfolio propio: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Creá tu portfolio antes de mandar mensajes.');
  });

  it('perfil objetivo no encontrado: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'me-1' }, results: [{ data: { id: 'me-1' } }, { data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(404);
  });

  it('mandarse mensaje a uno mismo: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [{ data: { id: 'me-1' } }, { data: { id: 'me-1' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'self' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('No podés mandarte un mensaje a vos mismo.');
  });

  it('ya existe conversación con ese perfil: devuelve la existente (200), no inserta', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'p2' } },
        { data: { id: 'conv-existing' } }, // ya existe
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'conv-existing' });
  });

  it('no existe conversación: la crea y devuelve 201', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'p2' } },
        { data: null }, // no existe
        { data: { id: 'conv-new' }, error: null }, // insert
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'conv-new' });
  });

  it('carrera al insertar (23505): re-consulta y devuelve la conversación ganadora (200, no 500)', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'p2' } },
        { data: null }, // no existía al chequear
        { data: null, error: { code: '23505', message: 'duplicate key' } }, // insert perdió la carrera
        { data: { id: 'conv-race-winner' } }, // re-consulta
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'conv-race-winner' });
  });

  it('error real (no 23505) al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'p2' } },
        { data: null },
        { data: null, error: { code: 'XX000', message: 'insert failed' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('23505 pero la re-consulta tampoco encuentra nada: cae a 500 con el mensaje original', async () => {
    const supabase = mockSupabase({
      user: { id: 'me-1' },
      results: [
        { data: { id: 'me-1' } },
        { data: { id: 'p2' } },
        { data: null },
        { data: null, error: { code: '23505', message: 'duplicate key' } },
        { data: null }, // re-consulta tampoco la encuentra
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ handle: 'beto' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('duplicate key');
  });
});
