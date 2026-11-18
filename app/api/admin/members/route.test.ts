import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email', () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/notify', () => ({ notify: vi.fn().mockResolvedValue(undefined) }));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';

function req(body: unknown) {
  return jsonRequest('http://localhost/api/admin/members', body);
}

function grant(supabase: unknown, role: string = 'dueño') {
  vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' }, role } as never);
}

function mockInviteeEmail() {
  vi.mocked(createAdminClient).mockReturnValue({
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'a@b.c' } } }) } },
  } as never);
}

describe('GET /api/admin/members', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await GET(jsonRequest('http://localhost/api/admin/members'));
    expect(res.status).toBe(404);
  });

  it('sin acceso: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await GET(jsonRequest('http://localhost/api/admin/members'));
    expect(res.status).toBe(401);
    expect(requireProjectAccess).toHaveBeenCalledWith('project-1', { minRole: 'editor' });
  });

  it('devuelve dueño, miembros y myRole', async () => {
    const owner = { id: 'o1', handle: 'duena', display_name: 'Dueña', avatar_image: null };
    const members = [{ id: 'm1', role: 'editor', status: 'accepted' }];
    const supabase = mockSupabase({
      results: [{ data: { owner_id: 'o1' } }, { data: owner }, { data: members, error: null }],
    });
    grant(supabase, 'gestor');
    const res = await GET(jsonRequest('http://localhost/api/admin/members'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ owner, members, myRole: 'gestor' });
  });
});

describe('POST /api/admin/members', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  it('body inválido: 400 antes de chequear acceso', async () => {
    const res = await POST(req({ handle: 'ana', role: 'dueño' }));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('pide rol administrador', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(401);
    expect(requireProjectAccess).toHaveBeenCalledWith('project-1', { minRole: 'administrador' });
  });

  it('handle inexistente: 404', async () => {
    grant(mockSupabase({ results: [{ data: null }] }));
    const res = await POST(req({ handle: 'nadie', role: 'editor' }));
    expect(res.status).toBe(404);
  });

  it('un administrador invitando administrador: 403', async () => {
    grant(
      mockSupabase({
        results: [{ data: { id: 'p1' } }, { data: { name: 'Torre', owner_id: 'o1' } }, { data: null }],
      }),
      'administrador',
    );
    const res = await POST(req({ handle: 'ana', role: 'administrador' }));
    expect(res.status).toBe(403);
  });

  it('ya es parte del equipo: 409', async () => {
    grant(
      mockSupabase({
        results: [
          { data: { id: 'p1' } },
          { data: { name: 'Torre', owner_id: 'o1' } },
          { data: { id: 'm1', status: 'accepted' } },
        ],
      }),
    );
    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(409);
  });

  it('rate limit: 429', async () => {
    grant(
      mockSupabase({
        results: [{ data: { id: 'p1' } }, { data: { name: 'Torre', owner_id: 'o1' } }, { data: null }, { count: 10 }],
      }),
    );
    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(429);
  });

  it('reinvita a quien rechazó con un solo update, 201', async () => {
    const row = { id: 'm1', status: 'pending', role: 'gestor' };
    const supabase = mockSupabase({
      results: [
        { data: { id: 'p1' } },
        { data: { name: 'Torre', owner_id: 'o1' } },
        { data: { id: 'm1', status: 'declined' } },
        { count: 0 },
        { data: row },
      ],
    });
    grant(supabase);
    mockInviteeEmail();

    const res = await POST(req({ handle: 'ana', role: 'gestor' }));
    expect(res.status).toBe(201);
    type Chain = { update: { mock: { calls: unknown[][] } } };
    const updates = supabase.from.mock.results.map((r) => r.value as Chain).filter((c) => c.update.mock.calls.length > 0);
    expect(updates).toHaveLength(1);
    expect(updates[0].update.mock.calls).toHaveLength(1);
    expect(updates[0].update.mock.calls[0][0]).toMatchObject({ status: 'pending', role: 'gestor' });
    expect(notify).toHaveBeenCalled();
  });

  it('reinvitación rechazada por el trigger (42501): 403', async () => {
    grant(
      mockSupabase({
        results: [
          { data: { id: 'p1' } },
          { data: { name: 'Torre', owner_id: 'o1' } },
          { data: { id: 'm1', status: 'declined' } },
          { count: 0 },
          { data: null, error: { code: '42501', message: 'x' } },
        ],
      }),
    );
    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(403);
    expect(notify).not.toHaveBeenCalled();
  });

  it('invitación nueva: inserta, notifica project_invite, 201', async () => {
    const row = { id: 'm2', status: 'pending', role: 'editor' };
    const supabase = mockSupabase({
      results: [
        { data: { id: 'p1' } },
        { data: { name: 'Torre', owner_id: 'o1' } },
        { data: null },
        { count: 0 },
        { data: row },
      ],
    });
    grant(supabase);
    mockInviteeEmail();

    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(
      supabase,
      expect.objectContaining({ recipientId: 'p1', type: 'project_invite', entityId: 'project-1' }),
    );
    expect(sendEmail).toHaveBeenCalled();
  });

  it('insert rechazado por el trigger (42501): 403', async () => {
    grant(
      mockSupabase({
        results: [
          { data: { id: 'p1' } },
          { data: { name: 'Torre', owner_id: 'o1' } },
          { data: null },
          { count: 0 },
          { data: null, error: { code: '42501', message: 'x' } },
        ],
      }),
    );
    const res = await POST(req({ handle: 'ana', role: 'editor' }));
    expect(res.status).toBe(403);
  });
});
