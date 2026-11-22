import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { PATCH } from './route';

const params = { params: Promise.resolve({ id: 'm1' }) };
const req = (body: unknown) => jsonRequest('http://localhost/api/members/m1/respond', body, { method: 'PATCH' });

describe('PATCH /api/members/[id]/respond', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  it('sin sesión: 401', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase() as never);
    expect((await PATCH(req({ status: 'accepted' }), params)).status).toBe(401);
  });

  it('status inválido: 400', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: { id: 'me' } }) as never);
    expect((await PATCH(req({ status: 'pending' }), params)).status).toBe(400);
  });

  it('solo responde filas pendientes: 404 si no estaba pending', async () => {
    const supabase = mockSupabase({ user: { id: 'me' }, results: [{ data: null, error: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const res = await PATCH(req({ status: 'accepted' }), params);
    expect(res.status).toBe(404);
    const chain = supabase.from.mock.results[0].value as { eq: { mock: { calls: unknown[][] } } };
    expect(chain.eq.mock.calls).toContainEqual(['status', 'pending']);
    expect(notify).not.toHaveBeenCalled();
  });

  it('42501: 403', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ user: { id: 'me' }, results: [{ data: null, error: { code: '42501', message: 'x' } }] }) as never,
    );
    expect((await PATCH(req({ status: 'accepted' }), params)).status).toBe(403);
  });

  it('aceptar notifica project_invite_accepted al que invitó', async () => {
    const row = { id: 'm1', status: 'accepted', invited_by: 'inviter', project_id: 'p1' };
    const supabase = mockSupabase({
      user: { id: 'me' },
      results: [{ data: row }, { data: { name: 'Torre <b>' } }, { data: { display_name: 'Ana' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'i@x.c' } } }) } },
    } as never);

    const res = await PATCH(req({ status: 'accepted' }), params);
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith({
      recipientId: 'inviter',
      actorId: 'me',
      type: 'project_invite_accepted',
      entityId: 'p1',
    });
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain('&lt;b&gt;');
  });

  it('rechazar no notifica', async () => {
    const row = { id: 'm1', status: 'declined', invited_by: 'inviter', project_id: 'p1' };
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: { id: 'me' }, results: [{ data: row }] }) as never);
    const res = await PATCH(req({ status: 'declined' }), params);
    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
});
