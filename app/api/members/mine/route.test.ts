import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

describe('GET /api/members/mine', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    expect((await GET()).status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('lee nombres de proyecto con el cliente admin', async () => {
    const supabase = mockSupabase({
      user: { id: 'me' },
      results: [
        { data: [{ id: 'm1', role: 'editor', invited_by: 'u2', project_id: 'p1' }] },
        { data: [{ id: 't1', from_user: 'u2', project_id: 'p2' }] },
        { data: [{ id: 'u2', handle: 'ana', display_name: 'Ana' }] },
      ],
    });
    const admin = mockSupabase({
      results: [{ data: [{ id: 'p1', name: 'Borrador', slug: 'borrador' }, { id: 'p2', name: 'Otro', slug: 'otro' }] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      invitations: [
        { id: 'm1', role: 'editor', project: { id: 'p1', name: 'Borrador', slug: 'borrador' }, inviter: { handle: 'ana', display_name: 'Ana' } },
      ],
      transfers: [{ id: 't1', project: { id: 'p2', name: 'Otro' }, from: { handle: 'ana', display_name: 'Ana' } }],
    });
    const chain = admin.from.mock.results[0].value as { in: { mock: { calls: unknown[][] } } };
    expect(chain.in.mock.calls[0]).toEqual(['id', ['p1', 'p2']]);
    expect(supabase.from.mock.calls.map((c) => c[0])).not.toContain('projects');
  });

  it('proyecto ilegible: project null', async () => {
    const supabase = mockSupabase({
      user: { id: 'me' },
      results: [{ data: [{ id: 'm1', role: 'editor', invited_by: null, project_id: 'p1' }] }, { data: [] }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ data: [] }] }) as never);
    const body = await (await GET()).json();
    expect(body.invitations[0]).toMatchObject({ project: null, inviter: null });
  });
});
