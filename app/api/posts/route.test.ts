import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const SHARED_ID = '22222222-2222-4222-8222-222222222222';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/posts', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('feed global (sin sesión): trae posts con likeCount/commentCount', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [
        { data: [{ id: 'p1', shared_post_id: null, author_id: 'a1', body: 'hi' }] }, // posts
        { data: [{ post_id: 'p1', profile_id: 'user-x' }] }, // post_likes
        { data: [{ post_id: 'p1' }] }, // post_comments
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.posts).toEqual([
      { id: 'p1', shared_post_id: null, author_id: 'a1', body: 'hi', shared_post: null, likeCount: 1, likedByMe: false, commentCount: 1, savedByMe: false, sampleLikers: [] },
    ]);
  });

  it('authorHandle sin perfil encontrado: posts vacío', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [{ data: [] }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?authorHandle=nadie'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], hasMore: false });
  });

  it('authorHandle con perfil: filtra por ese autor', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [
        { data: [{ id: 'p1', shared_post_id: null }] }, // posts
        { data: { id: 'profile-1' } }, // profiles by handle
        { data: [] }, // post_likes
        { data: [] }, // post_comments
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?authorHandle=ana'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
  });

  it('scope=following con sesión: filtra por gente que sigo + yo mismo', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ id: 'p1', shared_post_id: null }] }, // posts
        { data: { id: 'user-1' } }, // myProfile
        { data: [{ following_id: 'user-2' }] }, // follows
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?scope=following'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
  });

  it('scope=collaborations con sesión: filtra por dueños/colaboradores de mis proyectos', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ id: 'project-1' }] }, // projects (owner_id = me)
        { data: [{ project_id: 'project-2' }] }, // project_collaborators (yo como colaborador aceptado)
        { data: [{ owner_id: 'owner-2' }] }, // projects.owner_id in (project-1, project-2)
        { data: [{ profile_id: 'collab-1' }] }, // project_collaborators aceptados en esos proyectos
        { data: [{ id: 'p1', shared_post_id: null }] }, // posts
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?scope=collaborations'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
  });

  it('scope=collaborations sin proyectos propios ni colaboraciones: posts vacío', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] }, // posts (query se arma antes de resolver el scope, se descarta)
        { data: [] }, // projects
        { data: [] }, // project_collaborators
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?scope=collaborations'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], hasMore: false });
  });

  it('scope=saved con sesión: filtra por mis posts guardados', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [{ post_id: 'p1' }] }, // saved_posts
        { data: [{ id: 'p1', shared_post_id: null }] }, // posts
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [] }, // saved_posts (withCounts)
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?scope=saved'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.posts).toHaveLength(1);
  });

  it('scope=saved sin nada guardado: posts vacío', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: [] }, // posts (query se arma antes de resolver el scope, se descarta)
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?scope=saved'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], hasMore: false });
  });

  it('sort=top: ordena por likeCount y no pagina', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [
        { data: [{ id: 'p1', shared_post_id: null }, { id: 'p2', shared_post_id: null }] }, // posts
        { data: [{ post_id: 'p2', profile_id: 'x' }, { post_id: 'p2', profile_id: 'y' }] }, // post_likes (p2 tiene más likes)
        { data: [] }, // post_comments
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts?sort=top'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.hasMore).toBe(false);
    expect(body.posts.map((p: { id: string }) => p.id)).toEqual(['p2', 'p1']);
  });

  it('con repost: incluye shared_post embebido', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [
        { data: [{ id: 'p1', shared_post_id: 'p0' }] }, // posts
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [{ id: 'p0', body: 'original', image_url: null, created_at: 't', author: { handle: 'orig' } }] }, // shared posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts'));
    const body = await res.json();
    expect(body.posts[0].shared_post).toEqual({ id: 'p0', body: 'original', image_url: null, created_at: 't', author: { handle: 'orig' } });
  });

  it('con likes: sampleLikers trae display_name/avatar_image en snake_case (shape real de Supabase)', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [
        { data: [{ id: 'p1', shared_post_id: null }] }, // posts
        { data: [{ post_id: 'p1', profile_id: 'liker-1', profile: { display_name: 'Ana', avatar_image: null } }] }, // post_likes
        { data: [] }, // post_comments
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts'));
    const body = await res.json();
    expect(body.posts[0].sampleLikers).toEqual([{ display_name: 'Ana', avatar_image: null }]);
  });

  it('error de la base: 200 con lista vacía', async () => {
    const supabase = mockSupabase({ user: null, results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [], hasMore: false });
  });

  it('más de PAGE_SIZE filas: hasMore true', async () => {
    const rows = Array.from({ length: 21 }, (_, i) => ({ id: `p${i}`, shared_post_id: null }));
    const supabase = mockSupabase({
      user: null,
      results: [{ data: rows }, { data: [] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/posts'));
    const body = await res.json();
    expect(body.hasMore).toBe(true);
    expect(body.posts).toHaveLength(20);
  });
});

describe('POST /api/posts', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  function req(body: unknown) {
    return jsonRequest('http://localhost/api/posts', body);
  }

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hola' }));
    expect(res.status).toBe(401);
  });

  it('sin portfolio/perfil creado: 400, no sigue', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hola' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Creá tu portfolio antes de publicar.');
  });

  it('body inválido (imageUrl no es URL): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: { id: 'user-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ imageUrl: 'no-es-url' }));
    expect(res.status).toBe(400);
  });

  it('sin texto y sin repost: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: { id: 'user-1' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el texto del post');
  });

  it('rate limit alcanzado (5 posts en 5 min): 429', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'user-1' } }, { count: 5 }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hola' }));
    expect(res.status).toBe(429);
  });

  it('error de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'user-1' } }, { count: 0 }, { data: null, error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hola' }));
    expect(res.status).toBe(500);
  });

  it('feliz sin menciones: crea el post', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // profile check
        { count: 0 }, // rate-limit count
        { data: { id: 'p1', author_id: 'user-1', shared_post_id: null, body: 'hello' } }, // insert
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hello' }));
    expect(res.status).toBe(201);
    expect(notify).not.toHaveBeenCalled();
  });

  it('feliz con menciones: notifica a cada handle mencionado', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // profile check
        { count: 0 }, // rate-limit count
        { data: { id: 'p1', author_id: 'user-1', shared_post_id: null, body: 'hey @ana check this out' } }, // insert
        { data: [{ id: 'mentioned-1' }] }, // profiles by handle (mentions)
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ body: 'hey @ana check this out' }));
    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(supabase, {
      recipientId: 'mentioned-1',
      actorId: 'user-1',
      type: 'mention',
      entityId: 'p1',
    });
  });

  it('repost sin texto propio: permitido, embebe el post original', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // profile check
        { count: 0 }, // rate-limit count
        { data: { id: 'p1', author_id: 'user-1', shared_post_id: SHARED_ID, body: '' } }, // insert
        { data: [] }, // post_likes
        { data: [] }, // post_comments
        { data: [{ id: SHARED_ID, body: 'original', image_url: null, created_at: 't', author: { handle: 'orig' } }] }, // shared posts
        { data: [] }, // saved_posts
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(req({ sharedPostId: SHARED_ID }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.shared_post).toEqual({ id: SHARED_ID, body: 'original', image_url: null, created_at: 't', author: { handle: 'orig' } });
  });
});
