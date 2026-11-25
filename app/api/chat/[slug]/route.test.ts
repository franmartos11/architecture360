import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn(async () => null) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/project-canonical', () => ({ projectCanonical: vi.fn(async (slug: string) => `https://atrium.app/proyecto/${slug}`) }));
vi.mock('@/lib/whatsapp-bot/ia/cliente', () => ({ crearClienteClaude: vi.fn(() => ({})) }));
vi.mock('@/lib/whatsapp-bot/web/chat', () => ({ turnoChatWeb: vi.fn(), charlaWeb: vi.fn() }));

import { NextResponse } from 'next/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { createAdminClient } from '@/lib/supabase/admin';
import { charlaWeb, turnoChatWeb } from '@/lib/whatsapp-bot/web/chat';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const TOKEN = '11111111-1111-4111-8111-111111111111';
const ctx = { params: Promise.resolve({ slug: 'torre-sol' }) };
const post = (body: unknown, ip = '1.2.3.4') =>
  new Request('http://localhost:3000/api/chat/torre-sol', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
const get = (q: string) => new Request(`http://localhost:3000/api/chat/torre-sol${q}`, { headers: { 'x-forwarded-for': '1.2.3.4' } });

const BOT = { id: 'bot1', project_id: 'p1', chat_web: true, nombre_bot: 'Sofía' };
function conChat(proyecto: unknown = { id: 'p1', slug: 'torre-sol', published: true }, bot: unknown = BOT) {
  const sb = mockSupabase({ results: [{ data: proyecto }, { data: bot }] });
  vi.mocked(createAdminClient).mockReturnValue(sb as never);
  return sb;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test');
  vi.mocked(rateLimitOrRespond).mockResolvedValue(null);
  vi.mocked(turnoChatWeb).mockResolvedValue({ token: TOKEN, partes: ['Hola'], imagenes: [], documentos: [] });
});

describe('POST /api/chat/[slug]', () => {
  it.each([
    ['vacío', { mensaje: '   ' }],
    ['de 1001 caracteres', { mensaje: 'a'.repeat(1001) }],
    ['con token que no es uuid', { mensaje: 'Hola', token: 'abc' }],
    ['sin mensaje', {}],
  ])('mensaje %s → 400', async (_n, body) => {
    conChat();
    const res = await POST(post(body), ctx);
    expect(res.status).toBe(400);
    expect(turnoChatWeb).not.toHaveBeenCalled();
  });

  it.each([
    ['no publicado', { id: 'p1', slug: 'torre-sol', published: false }, BOT],
    ['inexistente', null, BOT],
    ['sin bot', { id: 'p1', slug: 'torre-sol', published: true }, null],
    ['con el chat apagado', { id: 'p1', slug: 'torre-sol', published: true }, { ...BOT, chat_web: false }],
  ])('proyecto %s → 404', async (_n, proyecto, bot) => {
    conChat(proyecto, bot);
    const res = await POST(post({ mensaje: 'Hola' }), ctx);
    expect(res.status).toBe(404);
    expect(turnoChatWeb).not.toHaveBeenCalled();
  });

  it('límite por IP: 20 cada 10 minutos', async () => {
    conChat();
    vi.mocked(rateLimitOrRespond).mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 429 }));
    const res = await POST(post({ mensaje: 'Hola' }), ctx);
    expect(res.status).toBe(429);
    expect(vi.mocked(rateLimitOrRespond).mock.calls[0][0]).toEqual({ key: 'chat:ip:1.2.3.4', windowSeconds: 600, max: 20 });
    expect(turnoChatWeb).not.toHaveBeenCalled();
  });

  it('charlas nuevas: además, como mucho 5 por hora por IP; seguir una charla no cuenta', async () => {
    conChat();
    await POST(post({ mensaje: 'Hola' }), ctx);
    expect(vi.mocked(rateLimitOrRespond).mock.calls.map((c) => c[0])).toEqual([
      { key: 'chat:ip:1.2.3.4', windowSeconds: 600, max: 20 },
      { key: 'chat-nueva:ip:1.2.3.4', windowSeconds: 3600, max: 5 },
    ]);
    vi.mocked(rateLimitOrRespond).mockClear();
    conChat();
    await POST(post({ mensaje: 'Hola', token: TOKEN }), ctx);
    expect(vi.mocked(rateLimitOrRespond).mock.calls.map((c) => c[0].key)).toEqual(['chat:ip:1.2.3.4']);
  });

  it('tope de charlas nuevas → 429 sin correr el turno', async () => {
    conChat();
    vi.mocked(rateLimitOrRespond).mockResolvedValueOnce(null).mockResolvedValueOnce(NextResponse.json({ error: 'x' }, { status: 429 }));
    expect((await POST(post({ mensaje: 'Hola' }), ctx)).status).toBe(429);
    expect(turnoChatWeb).not.toHaveBeenCalled();
  });

  it('sin ANTHROPIC_API_KEY → 503', async () => {
    conChat();
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = await POST(post({ mensaje: 'Hola' }), ctx);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBeTruthy();
  });

  it('caso feliz: corre el turno con la URL pública y el ref normalizado', async () => {
    conChat();
    const res = await POST(post({ mensaje: ' Hola ', token: TOKEN, visitorId: TOKEN, ref: 'Pérez Prop' }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ token: TOKEN, partes: ['Hola'], imagenes: [], documentos: [] });
    const arg = vi.mocked(turnoChatWeb).mock.calls[0][0];
    expect(arg).toMatchObject({ projectId: 'p1', token: TOKEN, mensaje: 'Hola', visitorId: TOKEN, ref: 'perez-prop', sitio: 'https://atrium.app/proyecto/torre-sol' });
    expect(arg.bot).toMatchObject({ id: 'bot1' });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('ref vacío queda null', async () => {
    conChat();
    await POST(post({ mensaje: 'Hola', ref: '***' }), ctx);
    expect(vi.mocked(turnoChatWeb).mock.calls[0][0].ref).toBeNull();
  });

  it('token de otra charla o de otro proyecto → 404', async () => {
    conChat();
    vi.mocked(turnoChatWeb).mockResolvedValue(null);
    const res = await POST(post({ mensaje: 'Hola', token: TOKEN }), ctx);
    expect(res.status).toBe(404);
  });

  it('error inesperado → 500 con log', async () => {
    conChat();
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(turnoChatWeb).mockRejectedValue(new Error('boom'));
    const res = await POST(post({ mensaje: 'Hola' }), ctx);
    expect(res.status).toBe(500);
    expect(String(log.mock.calls[0][0])).toContain('[chat web]');
    log.mockRestore();
  });
});

describe('GET /api/chat/[slug]', () => {
  it('sin token o con token inválido → 400', async () => {
    conChat();
    expect((await GET(get(''), ctx)).status).toBe(400);
    expect((await GET(get('?token=abc'), ctx)).status).toBe(400);
  });

  it('token ajeno → 404', async () => {
    conChat();
    vi.mocked(charlaWeb).mockResolvedValue(null);
    expect((await GET(get(`?token=${TOKEN}`), ctx)).status).toBe(404);
  });

  it('chat apagado → 404 sin leer la charla', async () => {
    conChat(undefined, { ...BOT, chat_web: false });
    expect((await GET(get(`?token=${TOKEN}`), ctx)).status).toBe(404);
    expect(charlaWeb).not.toHaveBeenCalled();
  });

  it('token válido → la charla', async () => {
    conChat();
    const mensajes = [{ autor: 'cliente', tipo: 'texto', cuerpo: 'Hola' }];
    vi.mocked(charlaWeb).mockResolvedValue({ mensajes } as never);
    const res = await GET(get(`?token=${TOKEN}`), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mensajes });
    expect(vi.mocked(charlaWeb).mock.calls[0].slice(1)).toEqual(['p1', TOKEN]);
  });
});
