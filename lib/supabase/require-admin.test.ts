import { describe, it, expect, vi, beforeEach } from 'vitest';

// requireAdminUser es una delegación pura a getRequestUser (lib/supabase/auth.ts,
// que a su vez envuelve supabase.auth.getUser() en React.cache()) — se
// mockea en ese límite en vez de re-probar los internals de React.cache,
// que no son código propio.
vi.mock('./auth', () => ({ getRequestUser: vi.fn() }));
vi.mock('server-only', () => ({}));

import { getRequestUser } from './auth';
import { requireAdminUser } from './require-admin';

describe('requireAdminUser', () => {
  beforeEach(() => {
    vi.mocked(getRequestUser).mockReset();
  });

  it('devuelve null si no hay sesión', async () => {
    vi.mocked(getRequestUser).mockResolvedValue(null as never);
    expect(await requireAdminUser()).toBeNull();
  });

  it('devuelve el usuario tal cual cuando hay sesión — sin lógica extra propia', async () => {
    const user = { id: 'admin-1' };
    vi.mocked(getRequestUser).mockResolvedValue(user as never);
    expect(await requireAdminUser()).toEqual(user);
  });
});
