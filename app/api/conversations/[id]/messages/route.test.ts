import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const CONVO_ID = '11111111-1111-1111-1111-111111111111';
const params = () => Promise.resolve({ id: CONVO_ID });

function makeMessages(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `msg-${i}`, body: `hola ${i}` }));
}

describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: lista vacía, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], hasMore: false });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('conversación inexistente o el usuario no es participante: lista vacía, no revela cuál fue el motivo', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null }], // .from('conversations')...maybeSingle() -> no existe
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], hasMore: false });
  });

  it('usuario no participa en esa conversación: lista vacía', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'other-a', participant_two: 'other-b' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], hasMore: false });
  });

  it('participante: devuelve los mensajes de la conversación', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: makeMessages(5) },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toHaveLength(5);
    expect(json.hasMore).toBe(false);
  });

  it('una fila más que PAGE_SIZE (31): hasMore true, recortado a 30', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: makeMessages(31) },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    const json = await res.json();
    expect(json.hasMore).toBe(true);
    expect(json.messages).toHaveLength(30);
  });

  it('con cursor ?before=: sigue funcionando normalmente', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: makeMessages(2) },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(
      new Request(`http://localhost/api/conversations/${CONVO_ID}/messages?before=2026-01-01T00:00:00.000Z`),
      { params: params() }
    );

    expect(res.status).toBe(200);
    expect((await res.json()).messages).toHaveLength(2);
  });

  it('error de la base al traer mensajes: degrada a lista vacía en vez de 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: null, error: { message: 'db down' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ messages: [], hasMore: false });
  });
});

describe('POST /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  function post(body: unknown) {
    return jsonRequest(`http://localhost/api/conversations/${CONVO_ID}/messages`, body);
  }

  it('sin sesión: 401, sin tocar la base', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('usuario no participa en la conversación: 404', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'other-a', participant_two: 'other-b' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(404);
  });

  it('conversación inexistente: 404', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(404);
  });

  it('body inválido (url de adjunto mal formada): 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ attachmentUrl: 'no-es-una-url' }), { params: params() });

    expect(res.status).toBe(400);
  });

  it('mensaje sin texto, sin post compartido y sin adjunto: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({}), { params: params() });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/texto/i);
  });

  it('rate limit alcanzado (30 mensajes en 5 min): 429, no inserta', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { count: 30 }, // rate-limit count query
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(429);
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { count: 0 },
        { data: null, error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('mensaje válido: inserta, actualiza last_message_at, notifica al OTRO participante, y devuelve 201', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { count: 0 },
        { data: { id: 'msg-1', body: 'hola' } },
        { data: null }, // .from('conversations').update(...)
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'msg-1', body: 'hola' });
    expect(notify).toHaveBeenCalledWith(supabase, {
      recipientId: 'user-2',
      actorId: 'user-1',
      type: 'message',
      entityId: CONVO_ID,
    });
  });

  it('mensaje que es solo un post compartido (sin texto): pasa la validación', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { count: 0 },
        { data: { id: 'msg-2' } },
        { data: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ sharedPostId: 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab' }), { params: params() });

    expect(res.status).toBe(201);
  });
});
