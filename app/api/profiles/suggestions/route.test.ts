import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function get(url: string) {
  return new Request(url);
}

describe('GET /api/profiles/suggestions', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: {suggestions:[]}', async () => {
    const supabase = mockSupabase({ user: null, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/suggestions'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });

  it('sesión sin perfil propio: {suggestions:[]}, no consulta follows/sugerencias', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/suggestions'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });

  it('feliz: excluye a quienes ya sigo y a mí mismo, mapea a camelCase', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // myProfile
        { data: [{ following_id: 'user-2' }] }, // follows
        {
          data: [
            { id: 'user-3', handle: 'ana', display_name: 'Ana', avatar_image: null, account_type: 'pro', bio: 'hola' },
          ],
        }, // suggestions
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/suggestions'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions).toEqual([
      { id: 'user-3', handle: 'ana', displayName: 'Ana', avatarImage: null, accountType: 'pro', bio: 'hola' },
    ]);
  });

  it('respeta ?limit= en la consulta', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'user-1' } }, { data: [] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/suggestions?limit=10'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ suggestions: [] });
  });

  it('sin gente seguida todavía: igual sugiere (excludedIds = solo yo mismo)', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'user-1' } }, // myProfile
        { data: [] }, // follows (ninguno)
        { data: [{ id: 'user-3', handle: 'ana', display_name: 'Ana', avatar_image: null, account_type: 'pro', bio: null }] },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/suggestions'));
    const body = await res.json();
    expect(body.suggestions).toHaveLength(1);
  });
});
