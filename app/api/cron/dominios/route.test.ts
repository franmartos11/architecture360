import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/vercel-domains', () => ({
  vercelDomainsConfigured: vi.fn(),
  getDomainState: vi.fn(),
  removeDomain: vi.fn(),
}));

import { createAdminClient } from '@/lib/supabase/admin';
import { getDomainState, removeDomain, vercelDomainsConfigured } from '@/lib/vercel-domains';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

const llamar = (auth?: string) =>
  GET(new Request('http://x/api/cron/dominios', { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 's3cr3t');
  vi.mocked(createAdminClient).mockReset();
  vi.mocked(vercelDomainsConfigured).mockReset().mockReturnValue(true);
  vi.mocked(getDomainState).mockReset();
  vi.mocked(removeDomain).mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/dominios', () => {
  it('sin el secreto (o sin CRON_SECRET configurado): 401 y no toca nada', async () => {
    expect((await llamar()).status).toBe(401);
    expect((await llamar('Bearer otro')).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await llamar('Bearer ')).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('libera los pendientes vencidos y baja los activos cuyo DNS ya no apunta acá', async () => {
    const admin = mockSupabase({
      results: [
        { data: [{ id: 'p1', hostname: 'vieja.com' }] }, // pendientes vencidos
        { error: null }, // delete p1
        { data: [{ id: 'a1', hostname: 'bien.com' }, { id: 'a2', hostname: 'mal.com' }, { id: 'a3', hostname: 'caido.com' }] }, // activos
        { error: null }, // update a2
      ],
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getDomainState).mockImplementation(async (h: string) => {
      if (h === 'caido.com') throw new Error('Vercel caído');
      return { verified: true, verification: [], misconfigured: h === 'mal.com' };
    });

    const res = await llamar('Bearer s3cr3t');

    expect(await res.json()).toEqual({ vencidos: 1, desactivados: 1, revisados: 2, errores: 1 });
    expect(removeDomain).toHaveBeenCalledWith('vieja.com');
    const update = admin.from.mock.results[3].value.update.mock.calls[0][0];
    expect(update.status).toBe('verified');
    // Un error de Vercel no cambia el estado: solo hubo un update (mal.com).
    expect(admin.from).toHaveBeenCalledTimes(4);
  });

  it('si Vercel ya no lo da por verificado, vuelve a pendiente', async () => {
    const admin = mockSupabase({ results: [{ data: [] }, { data: [{ id: 'a1', hostname: 'x.com' }] }, { error: null }] });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);
    vi.mocked(getDomainState).mockResolvedValue({ verified: false, verification: [], misconfigured: false });

    await llamar('Bearer s3cr3t');
    expect(admin.from.mock.results[2].value.update.mock.calls[0][0].status).toBe('pending');
  });

  it('sin Vercel configurado: no hace nada', async () => {
    vi.mocked(vercelDomainsConfigured).mockReturnValue(false);
    const res = await llamar('Bearer s3cr3t');
    expect(res.status).toBe(200);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
