import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn().mockResolvedValue(null) }));

import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

describe('GET /api/profiles/search', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
  });

  it('q vacío: {profiles:[]} sin tocar la base ni rate-limit', async () => {
    const res = await GET(get('http://localhost/api/profiles/search'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profiles: [] });
    expect(createClient).not.toHaveBeenCalled();
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('sin IP en la request: no rate-limitea y busca igual', async () => {
    const supabase = mockSupabase({ results: [{ data: [] }, { data: [] }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/search?q=ana'));
    expect(res.status).toBe(200);
    expect(rateLimitOrRespond).not.toHaveBeenCalled();
  });

  it('rate limit alcanzado: devuelve el 429 tal cual, sin consultar', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { NextResponse } = await import('next/server');
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'Too many' }, { status: 429 }));

    const res = await GET(get('http://localhost/api/profiles/search?q=ana', { 'x-forwarded-for': '1.2.3.4' }));
    expect(res.status).toBe(429);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('feliz: combina resultados por nombre y por handle, sin duplicar', async () => {
    const supabase = mockSupabase({
      results: [
        { data: [{ handle: 'ana', display_name: 'Ana Pérez', avatar_image: null, account_type: 'pro' }] }, // by display_name
        { data: [{ handle: 'analista', display_name: 'Otro', avatar_image: null, account_type: 'basic' }] }, // by handle
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/search?q=ana', { 'x-forwarded-for': '1.2.3.4' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profiles).toHaveLength(2);
    expect(body.profiles.map((p: { handle: string }) => p.handle).sort()).toEqual(['ana', 'analista']);
  });

  it('mismo handle en ambas búsquedas: no se duplica', async () => {
    const profile = { handle: 'ana', display_name: 'Ana Pérez', avatar_image: null, account_type: 'pro' };
    const supabase = mockSupabase({
      results: [{ data: [profile] }, { data: [profile] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/search?q=ana', { 'x-forwarded-for': '1.2.3.4' }));
    const body = await res.json();
    expect(body.profiles).toHaveLength(1);
  });

  it('recorta a RESULT_LIMIT (5) resultados combinados', async () => {
    const byName = Array.from({ length: 5 }, (_, i) => ({ handle: `name${i}`, display_name: 'x', avatar_image: null, account_type: 'basic' }));
    const byHandle = Array.from({ length: 5 }, (_, i) => ({ handle: `handle${i}`, display_name: 'x', avatar_image: null, account_type: 'basic' }));
    const supabase = mockSupabase({ results: [{ data: byName }, { data: byHandle }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/profiles/search?q=x', { 'x-forwarded-for': '1.2.3.4' }));
    const body = await res.json();
    expect(body.profiles).toHaveLength(5);
  });
});
