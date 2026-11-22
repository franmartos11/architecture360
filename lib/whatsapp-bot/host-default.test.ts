import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { asignarHostPorDefecto } from './host-default';

describe('asignarHostPorDefecto', () => {
  beforeEach(() => vi.mocked(createAdminClient).mockReset());
  afterEach(() => vi.unstubAllEnvs());

  it('sin WA_BOT_HOST_DEFAULT no toca la base', async () => {
    vi.stubEnv('WA_BOT_HOST_DEFAULT', '');
    expect(await asignarHostPorDefecto('b1')).toBeNull();
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('asigna el host solo si el bot no tenía (update condicionado a null)', async () => {
    vi.stubEnv('WA_BOT_HOST_DEFAULT', ' mac-pruebas ');
    const admin = mockSupabase({ results: [{ data: { host_permitido: 'mac-pruebas' } }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    expect(await asignarHostPorDefecto('b1')).toBe('mac-pruebas');
    const q = admin.from.mock.results[0].value;
    expect(q.update).toHaveBeenCalledWith({ host_permitido: 'mac-pruebas' });
    expect(q.eq).toHaveBeenCalledWith('id', 'b1');
    expect(q.is).toHaveBeenCalledWith('host_permitido', null);
  });

  it('bot que ya tenía host: no lo mueve y devuelve null', async () => {
    vi.stubEnv('WA_BOT_HOST_DEFAULT', 'mac-pruebas');
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase({ results: [{ data: null }] }) as never);
    expect(await asignarHostPorDefecto('b1')).toBeNull();
  });

  it('error de la base: null, sin tirar', async () => {
    vi.stubEnv('WA_BOT_HOST_DEFAULT', 'mac-pruebas');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createAdminClient).mockReturnValue(
      mockSupabase({ results: [{ data: null, error: { message: 'boom' } }] }) as never
    );
    expect(await asignarHostPorDefecto('b1')).toBeNull();
  });
});
