import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';

// requireProjectAccess es el único punto donde se decide "¿esta cuenta
// puede tocar este proyecto?" en todas las rutas admin. Se prueba mockeando
// el cliente de Supabase (y su RPC project_role_rank) en vez de necesitar
// RLS real corriendo.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));
vi.mock('@/lib/supabase/auth', () => ({
  getRequestUser: vi.fn(),
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/revalidate-project', () => ({ revalidateProjectById: vi.fn() }));
// 'server-only' solo rompe el build si se importa desde un Client Component;
// fuera del bundler de Next se neutraliza.
vi.mock('server-only', () => ({}));

import { after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRequestUser } from '@/lib/supabase/auth';
import {
  requireProjectAccess,
  resolveProjectIdFromBimModel,
  resolveProjectIdFromMember,
} from '@/lib/supabase/require-project-access';

function setup(rank: unknown, { user = { id: 'user-1' } as { id: string } | null, error = null as unknown } = {}) {
  const supabase = mockSupabase({ user, rpc: [{ data: rank, error }] });
  vi.mocked(createClient).mockResolvedValue(supabase as never);
  vi.mocked(getRequestUser).mockResolvedValue(user as never);
  return supabase;
}

describe('requireProjectAccess', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(getRequestUser).mockReset();
    vi.mocked(after).mockReset();
  });

  it('devuelve null si no hay sesión', async () => {
    setup(4, { user: null });
    expect(await requireProjectAccess('project-1')).toBeNull();
  });

  it('devuelve null con rango 0 (sin acceso o invitación pendiente)', async () => {
    setup(0);
    expect(await requireProjectAccess('project-1')).toBeNull();
  });

  it('devuelve null si el rol no alcanza el mínimo', async () => {
    setup(1);
    expect(await requireProjectAccess('project-1', { minRole: 'gestor' })).toBeNull();
  });

  it("devuelve role 'dueño' con rango 4", async () => {
    setup(4);
    const access = await requireProjectAccess('project-1');
    expect(access?.role).toBe('dueño');
    expect(access?.user.id).toBe('user-1');
  });

  it('por defecto exige editor', async () => {
    setup(1);
    const access = await requireProjectAccess('project-1');
    expect(access?.role).toBe('editor');
  });

  it('llama la RPC con p_project_id', async () => {
    const supabase = setup(2);
    await requireProjectAccess('project-1');
    expect(supabase.rpc).toHaveBeenCalledWith('project_role_rank', { p_project_id: 'project-1' });
  });

  it('devuelve null y loguea si la RPC falla', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(null, { error: { message: 'boom' } });
    expect(await requireProjectAccess('project-1')).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('con revalidate: true y acceso, agenda la revalidación', async () => {
    setup(4);
    await requireProjectAccess('project-1', { revalidate: true });
    expect(after).toHaveBeenCalledTimes(1);
  });

  it('sin acceso no agenda revalidación', async () => {
    setup(0);
    await requireProjectAccess('project-1', { revalidate: true });
    expect(after).not.toHaveBeenCalled();
  });
});

describe('resolveProjectIdFromBimModel', () => {
  it('devuelve el project_id de la pieza', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: { project_id: 'project-1' } }] }) as never
    );
    expect(await resolveProjectIdFromBimModel('bim-1')).toBe('project-1');
  });

  it('pieza inexistente: null', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await resolveProjectIdFromBimModel('bim-404')).toBeNull();
  });
});

describe('resolveProjectIdFromMember', () => {
  it('devuelve el project_id de la fila', async () => {
    vi.mocked(createClient).mockResolvedValue(
      mockSupabase({ results: [{ data: { project_id: 'project-9' } }] }) as never
    );
    expect(await resolveProjectIdFromMember('member-1')).toBe('project-9');
  });
});
