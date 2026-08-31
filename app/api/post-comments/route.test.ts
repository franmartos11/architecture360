import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const POST_ID = '11111111-1111-4111-8111-111111111111';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/post-comments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin postId: 400, no toca la base', async () => {
    const res = await GET(get('http://localhost/api/post-comments'));
    expect(res.status).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  it('lista comentarios con autores', async () => {
    const supabase = mockSupabase({
      results: [
        {
          data: [
            { id: 'c1', post_id: POST_ID, author_id: 'user-1', body: 'hola', created_at: '2026-01-01' },
          ],
        }, // .from('post_comments')
        { data: [{ id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null }] }, // .from('profiles')
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get(`http://localhost/api/post-comments?postId=${POST_ID}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.comments).toEqual([
      {
        id: 'c1',
        post_id: POST_ID,
        author_id: 'user-1',
        body: 'hola',
        created_at: '2026-01-01',
        author: { id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null },
      },
    ]);
  });

  it('sin comentarios: no consulta profiles, hasMore false', async () => {
    const supabase = mockSupabase({ results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get(`http://localhost/api/post-comments?postId=${POST_ID}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [], hasMore: false });
  });

  it('más de PAGE_SIZE filas: hasMore true y recorta a 20', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      post_id: POST_ID,
      author_id: 'user-1',
      body: `msg ${i}`,
      created_at: '2026-01-01',
    }));
    const supabase = mockSupabase({
      results: [{ data: rows }, { data: [{ id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null }] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get(`http://localhost/api/post-comments?postId=${POST_ID}`));
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.comments).toHaveLength(20);
  });

  it('error de la base: 200 con lista vacía (no rompe el feed)', async () => {
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get(`http://localhost/api/post-comments?postId=${POST_ID}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [], hasMore: false });
  });
});

describe('POST /api/post-comments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  function req(body: unknown) {
    return jsonRequest('http://localhost/api/post-comments', body);
  }

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: 'hola' }));
    expect(res.status).toBe(401);
  });

  it('body inválido (postId no es uuid): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: 'no-es-uuid', body: 'hola' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('comentario vacío tras sanitizar (solo tags HTML): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: '<script></script>' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rate limit alcanzado (5 comentarios en 5 min): 429, no inserta', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ count: 5 }], // count de comentarios recientes
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: 'hola' }));
    expect(res.status).toBe(429);
  });

  it('error de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ count: 0 }, { data: null, error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: 'hola' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('feliz: inserta, notifica al autor del post, devuelve el comentario con autor', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { count: 0 }, // rate-limit count
        { data: { id: 'c1', post_id: POST_ID, author_id: 'user-1', body: 'hola', created_at: '2026-01-01' } }, // insert
        { data: { author_id: 'post-author' } }, // .from('posts') lookup
        { data: [{ id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null }] }, // withAuthors
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: 'hola' }));
    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(supabase, {
      recipientId: 'post-author',
      actorId: 'user-1',
      type: 'comment',
      entityId: POST_ID,
    });
    const body = await res.json();
    expect(body.author).toEqual({ id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null });
  });

  it('post no encontrado: igual crea el comentario, no notifica', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { count: 0 },
        { data: { id: 'c1', post_id: POST_ID, author_id: 'user-1', body: 'hola', created_at: '2026-01-01' } },
        { data: null }, // post no existe
        { data: [] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ postId: POST_ID, body: 'hola' }));
    expect(res.status).toBe(201);
    expect(notify).not.toHaveBeenCalled();
  });
});
