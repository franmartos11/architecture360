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

function req(body: unknown) {
  return jsonRequest('http://localhost/api/collaborators/collab-1/respond', body);
}
function params(id = 'collab-1') {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/collaborators/[id]/respond', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  it('sin sesión: 401', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('status inválido: 400', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'maybe' }), params());
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base al actualizar: 500', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ error: { message: 'update failed' } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('update failed');
  });

  it('invitación no encontrada (RLS no matcheó nada): 404', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: null, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Invitación no encontrada');
  });

  it('rechazar (declined): actualiza pero no notifica ni manda email', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [{ data: { id: 'collab-1', status: 'declined', invited_by: 'owner-1', project_id: 'project-1' }, error: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await PATCH(req({ status: 'declined' }), params());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'collab-1', status: 'declined', invited_by: 'owner-1', project_id: 'project-1' });
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('aceptar (accepted): notifica a quien invitó y le manda email', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'collab-1', status: 'accepted', invited_by: 'owner-1', project_id: 'project-1' }, error: null }, // update
        { data: { name: 'Torre del Mar' } }, // .from('projects')...maybeSingle()
        { data: { display_name: 'Ana Pérez' } }, // .from('profiles')...maybeSingle()
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'owner@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith(supabase, {
      recipientId: 'owner-1',
      actorId: 'user-1',
      type: 'collaboration_accepted',
      entityId: 'project-1',
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: expect.stringContaining('Torre del Mar') })
    );
  });

  it('aceptar pero sin nombre de proyecto: no manda email (best-effort)', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'collab-1', status: 'accepted', invited_by: 'owner-1', project_id: 'project-1' }, error: null },
        { data: null }, // proyecto no encontrado
        { data: { display_name: 'Ana Pérez' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'owner@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('aceptar pero falla el lookup de admin: sigue devolviendo 200 (best-effort)', async () => {
    const supabase = mockSupabase({
      user: { id: 'user-1' },
      results: [
        { data: { id: 'collab-1', status: 'accepted', invited_by: 'owner-1', project_id: 'project-1' }, error: null },
        { data: { name: 'Torre del Mar' } },
        { data: { display_name: 'Ana Pérez' } },
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    vi.mocked(createAdminClient).mockImplementation(() => {
      throw new Error('admin down');
    });

    const res = await PATCH(req({ status: 'accepted' }), params());
    expect(res.status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
