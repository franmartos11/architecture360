import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-admin', () => ({ requireAdminUser: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { DELETE } from './route';

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/admin/fonts/[id]', () => {
  beforeEach(() => {
    vi.mocked(requireAdminUser).mockReset();
    vi.mocked(createClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue(null as never);
    const res = await DELETE(jsonRequest('http://localhost/api/admin/fonts/x'), params('x'));
    expect(res.status).toBe(401);
  });

  it('elimina correctamente, filtrando por owner_id: 200', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/fonts/x'), params('x'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('error de la base: 500', async () => {
    vi.mocked(requireAdminUser).mockResolvedValue({ id: 'user-1' } as never);
    const supabase = mockSupabase({ results: [{ error: { message: 'delete failed' } }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await DELETE(jsonRequest('http://localhost/api/admin/fonts/x'), params('x'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('delete failed');
  });
});
