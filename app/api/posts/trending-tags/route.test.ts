import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/posts/trending-tags', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('cuenta hashtags de posts recientes y devuelve el top 4', async () => {
    const supabase = mockSupabase({
      user: null,
      results: [{
        data: [
          { body: 'Cerramos #BIM y #Rosario hoy' },
          { body: 'Más sobre #BIM en obra' },
          { body: 'Sin hashtags acá' },
          { body: '#Rosario crece #BIM #ObraEnCurso #Concurso' },
        ],
      }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tags[0]).toEqual({ tag: 'BIM', count: 3 });
    expect(body.tags).toHaveLength(4);
  });

  it('error de la base: tags vacío', async () => {
    const supabase = mockSupabase({ user: null, results: [{ data: null, error: { message: 'boom' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ tags: [] });
  });

  it('sin posts: tags vacío', async () => {
    const supabase = mockSupabase({ user: null, results: [{ data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET();
    expect(await res.json()).toEqual({ tags: [] });
  });
});
