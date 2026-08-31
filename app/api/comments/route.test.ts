import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

function getReq(qs: string) {
  return new Request(`http://localhost/api/comments?${qs}`);
}
function postReq(body: unknown) {
  return jsonRequest('http://localhost/api/comments', body);
}

describe('GET /api/comments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin projectId: 400 antes de tocar la base', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(getReq(''));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('página completa (sin hasMore): junta comentarios con sus autores', async () => {
    const comments = [
      { id: 'c1', project_id: PROJECT_ID, author_id: 'author-1', body: 'Hola', created_at: '2026-01-01T00:00:00Z' },
      { id: 'c2', project_id: PROJECT_ID, author_id: 'author-2', body: 'Che', created_at: '2026-01-02T00:00:00Z' },
    ];
    const profiles = [
      { id: 'author-1', handle: 'ana', display_name: 'Ana', avatar_image: null },
      { id: 'author-2', handle: 'beto', display_name: 'Beto', avatar_image: null },
    ];
    const supabase = mockSupabase({ results: [{ data: comments, error: null }, { data: profiles }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(getReq(`projectId=${PROJECT_ID}`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.hasMore).toBe(false);
    expect(json.comments).toEqual([
      { ...comments[0], author: profiles[0] },
      { ...comments[1], author: profiles[1] },
    ]);
  });

  it('más de PAGE_SIZE filas: hasMore true, recorta a 20', async () => {
    const comments = Array.from({ length: 21 }, (_, i) => ({
      id: `c${i}`,
      project_id: PROJECT_ID,
      author_id: 'author-1',
      body: `msg ${i}`,
      created_at: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    const supabase = mockSupabase({
      results: [{ data: comments, error: null }, { data: [{ id: 'author-1', handle: 'ana', display_name: 'Ana', avatar_image: null }] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(getReq(`projectId=${PROJECT_ID}`));
    const json = await res.json();
    expect(json.hasMore).toBe(true);
    expect(json.comments).toHaveLength(20);
  });

  it('sin comentarios: no consulta profiles, devuelve lista vacía', async () => {
    const supabase = mockSupabase({ results: [{ data: [], error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(getReq(`projectId=${PROJECT_ID}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ comments: [], hasMore: false });
  });

  it('error de la base: 500', async () => {
    const supabase = mockSupabase({ results: [{ error: { message: 'query failed' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(getReq(`projectId=${PROJECT_ID}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('query failed');
  });
});

describe('POST /api/comments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: PROJECT_ID, body: 'Hola' }));
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('body inválido (zod): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: 'no-es-uuid', body: 'Hola' }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('comentario vacío tras sanitizar (solo tags HTML): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: PROJECT_ID, body: '<script></script>' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Falta el comentario');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('rate limit propio alcanzado: 429, no inserta', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ count: 5 }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: PROJECT_ID, body: 'Hola' }));
    expect(res.status).toBe(429);
  });

  it('error de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ count: 0 }, { error: { message: 'insert failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: PROJECT_ID, body: 'Hola' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('comentario válido: inserta y devuelve 201 con el autor embebido', async () => {
    const inserted = { id: 'c1', project_id: PROJECT_ID, author_id: 'user-1', body: 'Hola', created_at: '2026-01-01T00:00:00Z' };
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { count: 0 },
        { data: inserted, error: null },
        { data: [{ id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null }] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(postReq({ projectId: PROJECT_ID, body: 'Hola' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ...inserted, author: { id: 'user-1', handle: 'ana', display_name: 'Ana', avatar_image: null } });
  });
});
