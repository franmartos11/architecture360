import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/blocks', () => ({ isBlockedEitherWay: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { isBlockedEitherWay } from '@/lib/blocks';
import { rateLimitOrRespond } from '@/lib/rate-limit';
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
    vi.mocked(createAdminClient).mockReset();
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

  it('adjunto guardado como path (bucket privado): se resuelve a URL firmada', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: [{ id: 'msg-1', attachment_url: `${CONVO_ID}/123-abcde.png`, attachment_type: 'image' }] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({
      storage: { createSignedUrls: { data: [{ path: `${CONVO_ID}/123-abcde.png`, signedUrl: 'https://signed.example/123-abcde.png?token=x' }], error: null } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    const json = await res.json();
    expect(json.messages[0].attachment_url).toBe('https://signed.example/123-abcde.png?token=x');
  });

  it('adjunto viejo con URL pública completa (bucket anterior): pasa tal cual, no firma nada', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: [{ id: 'msg-1', attachment_url: 'https://xxx.supabase.co/storage/v1/object/public/project-media/old.png', attachment_type: 'image' }] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(new Request(`http://localhost/api/conversations/${CONVO_ID}/messages`), { params: params() });

    const json = await res.json();
    expect(json.messages[0].attachment_url).toBe('https://xxx.supabase.co/storage/v1/object/public/project-media/old.png');
    expect(createAdminClient).not.toHaveBeenCalled();
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
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
    vi.mocked(isBlockedEitherWay).mockReset().mockResolvedValue(false);
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
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

  it('attachmentPath de OTRA conversación (prefijo no coincide): 400, no inserta', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ attachmentPath: 'otra-conversacion/archivo.png', attachmentType: 'image' }), { params: params() });

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Adjunto inválido');
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

  it('alguno de los dos bloqueó al otro: 403, no llega a rate-limit ni a insertar', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(isBlockedEitherWay).mockResolvedValue(true);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(403);
    expect(isBlockedEitherWay).toHaveBeenCalledWith(supabase, 'user-1', 'user-2');
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate limit alcanzado (30 mensajes en 5 min): devuelve el 429 tal cual, no inserta', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Estás mandando mensajes muy rápido — esperá un momento.' }, { status: 429 }));

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalledWith('messages');
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: null, error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ body: 'hola' }), { params: params() });

    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('mensaje válido: inserta, actualiza last_message_at + preview, notifica al OTRO participante, y devuelve 201', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
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

  it('mensaje con adjunto válido (path con prefijo correcto): inserta y devuelve la URL firmada', async () => {
    const path = `${CONVO_ID}/123-abcde.png`;
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: { id: 'msg-3', attachment_url: path, attachment_type: 'image' } },
        { data: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = mockSupabase({
      storage: { createSignedUrls: { data: [{ path, signedUrl: 'https://signed.example/123-abcde.png?token=y' }], error: null } },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(post({ attachmentPath: path, attachmentType: 'image' }), { params: params() });

    expect(res.status).toBe(201);
    expect((await res.json()).attachment_url).toBe('https://signed.example/123-abcde.png?token=y');
  });

  it('mensaje que es solo un post compartido (sin texto): pasa la validación, preview con emoji', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: CONVO_ID, participant_one: 'user-1', participant_two: 'user-2' } },
        { data: { id: 'msg-2' } },
        { data: null },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(post({ sharedPostId: 'a1b2c3d4-e5f6-4a1b-8c2d-1234567890ab' }), { params: params() });

    expect(res.status).toBe(201);
  });
});
