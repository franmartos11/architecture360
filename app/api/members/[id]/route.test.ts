import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { DELETE } from './route';

const params = { params: Promise.resolve({ id: 'm1' }) };
const req = () => jsonRequest('http://localhost/api/members/m1', undefined, { method: 'DELETE' });

describe('DELETE /api/members/[id]', () => {
  beforeEach(() => vi.mocked(createClient).mockReset());

  it('sin sesión: 401', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);
    expect((await DELETE(req(), params)).status).toBe(401);
  });

  it('borra solo la fila propia', async () => {
    const supabase = mockSupabase({ user: { id: 'me' }, results: [{ data: [{ id: 'm1' }], error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await DELETE(req(), params);
    expect(res.status).toBe(200);
    const chain = supabase.from.mock.results[0].value as { eq: { mock: { calls: unknown[][] } } };
    expect(chain.eq.mock.calls).toEqual([['id', 'm1'], ['user_id', 'me']]);
  });

  it('ninguna fila: 404', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: 'me' }, results: [{ data: [], error: null }] }) as never,
    );
    expect((await DELETE(req(), params)).status).toBe(404);
  });
});
