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
import { POST } from './route';

function req(body: unknown) {
  return jsonRequest('http://localhost/api/admin/collaborators', body);
}

describe('POST /api/admin/collaborators', () => {
  beforeEach(() => {
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue(undefined);
    vi.mocked(notify).mockReset().mockResolvedValue(undefined);
  });

  it('sin proyecto activo: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(404);
  });

  it('falta el handle: 400 antes de chequear acceso', async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(401);
  });

  it('handle inexistente: 404', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] }); // .from('profiles')
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'no-existe' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatch(/handle/i);
  });

  it('ya acreditada (status accepted): 409, no inserta ni actualiza', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } }, // profiles
        { data: { name: 'Torre del Mar' } }, // projects
        { data: { id: 'collab-1', status: 'accepted' } }, // project_collaborators select existing
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/ya está acreditada/i);
  });

  it('ya invitada (status pending): 409', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: { name: 'Torre del Mar' } },
        { data: { id: 'collab-1', status: 'pending' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/pendiente/i);
  });

  it('había rechazado antes (status declined): reinvita con un update, 201', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } }, // profiles
        { data: { name: 'Torre del Mar' } }, // projects
        { data: { id: 'collab-1', status: 'declined' } }, // existing
        { data: { id: 'collab-1', status: 'pending' }, error: null }, // update().select().single()
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'ana@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(201);
    expect(notify).toHaveBeenCalledWith(supabase, expect.objectContaining({ recipientId: 'profile-1', type: 'collaboration_invite' }));
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ana@example.com' }));
  });

  it('error de la base al reinvitar (declined -> update): 500', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: { name: 'Torre del Mar' } },
        { data: { id: 'collab-1', status: 'declined' } },
        { data: null, error: { message: 'update failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(500);
    expect(notify).not.toHaveBeenCalled();
  });

  it('mandó demasiadas invitaciones seguidas: 429, no inserta', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } }, // profiles
        { data: { name: 'Torre del Mar' } }, // projects
        { data: null }, // no existing collaborator
        { count: 10 }, // rate-limit count
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(429);
  });

  it('invitación nueva: inserta, notifica, 201', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: { name: 'Torre del Mar' } },
        { data: null },
        { count: 0 },
        { data: { id: 'collab-1', status: 'pending' }, error: null }, // insert().select().single()
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);
    const admin = { auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: { email: 'ana@example.com' } } }) } } };
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'collab-1', status: 'pending' });
    expect(notify).toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalled();
  });

  it('insert choca con unique constraint (23505) por carrera: 409', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: { name: 'Torre del Mar' } },
        { data: null },
        { count: 0 },
        { data: null, error: { code: '23505', message: 'duplicate' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(409);
  });

  it('error genérico de la base al insertar: 500', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: { name: 'Torre del Mar' } },
        { data: null },
        { count: 0 },
        { data: null, error: { message: 'insert failed' } },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('insert failed');
  });

  it('proyecto sin nombre: inserta igual pero no intenta notificar', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'profile-1' } },
        { data: null }, // .from('projects') no encontró nombre
        { data: null },
        { count: 0 },
        { data: { id: 'collab-1', status: 'pending' }, error: null },
      ],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ handle: 'ana' }));
    expect(res.status).toBe(201);
    expect(notify).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
