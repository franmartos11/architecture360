import { describe, it, expect, vi, beforeEach } from 'vitest';

// requireProjectAccess es el único punto donde se decide "¿esta cuenta
// puede tocar este proyecto?" en todas las rutas admin — es la lógica de
// autorización con más superficie de bug silencioso de toda la app, así
// que se prueba mockeando el cliente de Supabase en vez de necesitar RLS
// real corriendo (no hay Supabase CLI/Docker disponible en este entorno).
vi.mock('./server', () => ({
  createClient: vi.fn(),
}));
// requireProjectAccess también usa cookies() indirectamente a través de
// resolveActiveProjectId/resolveRequestedProjectId — se mockea acá para
// que esos otros exports del mismo módulo no rompan el import.
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));
// 'server-only' solo existe para romper el build si algo así se importa
// desde un Client Component — fuera del bundler de Next no tiene sentido,
// así que se neutraliza en el entorno de test.
vi.mock('server-only', () => ({}));

import { createClient } from './server';
import { requireProjectAccess } from './require-project-access';

function mockSupabase({ user, projectRow }: { user: { id: string } | null; projectRow: { id: string } | null }) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col1: string, _val1: unknown) => ({
          eq: (_col2: string, _val2: unknown) => ({
            maybeSingle: async () => ({ data: projectRow }),
          }),
        }),
      }),
    }),
  };
}

describe('requireProjectAccess', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  it('devuelve null si no hay sesión', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: null, projectRow: null }) as never);
    const access = await requireProjectAccess('project-1');
    expect(access).toBeNull();
  });

  it('devuelve null si el proyecto no pertenece a esta cuenta (o no existe)', async () => {
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ user: { id: 'user-1' }, projectRow: null }) as never);
    const access = await requireProjectAccess('project-1');
    expect(access).toBeNull();
  });

  it('devuelve el acceso cuando el proyecto es de esta cuenta', async () => {
    const supabase = mockSupabase({ user: { id: 'user-1' }, projectRow: { id: 'project-1' } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const access = await requireProjectAccess('project-1');
    expect(access).not.toBeNull();
    expect(access?.user.id).toBe('user-1');
  });
});
