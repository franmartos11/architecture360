import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST, DELETE } from './route';

const POST_ID = 'post-1';
const OPTION_ID = '11111111-1111-4111-8111-111111111111';

function ctx() {
  return { params: Promise.resolve({ id: POST_ID }) };
}

describe('POST /api/posts/[id]/vote', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(`http://localhost/api/posts/${POST_ID}/vote`, { optionId: OPTION_ID }), ctx());
    expect(res.status).toBe(401);
  });

  it('optionId inválido (no uuid): 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(`http://localhost/api/posts/${POST_ID}/vote`, { optionId: 'no-es-uuid' }), ctx());
    expect(res.status).toBe(400);
  });

  it('el post no tiene encuesta: 404', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(`http://localhost/api/posts/${POST_ID}/vote`, { optionId: OPTION_ID }), ctx());
    expect(res.status).toBe(404);
  });

  it('la opción no pertenece a esa encuesta: 400', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'poll-1' } }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(`http://localhost/api/posts/${POST_ID}/vote`, { optionId: OPTION_ID }), ctx());
    expect(res.status).toBe(400);
  });

  it('feliz: vota y devuelve el conteo actualizado', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'poll-1' } }, // post_polls
        { data: { id: OPTION_ID } }, // post_poll_options
        { error: null }, // upsert vote
        { data: [{ option_id: OPTION_ID, profile_id: 'user-1' }, { option_id: 'other-option', profile_id: 'user-2' }] }, // tally
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await POST(jsonRequest(`http://localhost/api/posts/${POST_ID}/vote`, { optionId: OPTION_ID }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      counts: { [OPTION_ID]: 1, 'other-option': 1 },
      myVoteOptionId: OPTION_ID,
      totalVotes: 2,
    });
  });
});

describe('DELETE /api/posts/[id]/vote', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(new Request(`http://localhost/api/posts/${POST_ID}/vote`, { method: 'DELETE' }), ctx());
    expect(res.status).toBe(401);
  });

  it('feliz: retira el voto y devuelve el conteo actualizado', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'poll-1' } }, // post_polls
        { error: null }, // delete vote
        { data: [] }, // tally
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(new Request(`http://localhost/api/posts/${POST_ID}/vote`, { method: 'DELETE' }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counts: {}, myVoteOptionId: null, totalVotes: 0 });
  });
});
