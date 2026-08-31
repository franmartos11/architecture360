import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, rateLimitOrRespond } from './rate-limit';

function mockAdminClient(count: number) {
  const insert = vi.fn().mockResolvedValue({ error: null });
  const del = vi.fn().mockResolvedValue({ error: null });
  const selectChain = {
    eq: () => selectChain,
    gte: () => Promise.resolve({ count }),
  };
  const from = vi.fn(() => ({
    select: () => selectChain,
    insert,
    delete: () => ({ lt: del }),
  }));
  return { from, insert, delete: del };
}

describe('checkRateLimit', () => {
  beforeEach(() => {
    // Math.random() < 0.01 dispara el housekeeping de borrado — se fija en
    // 0.5 (siempre por encima del umbral) salvo en el test que lo cubre.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dentro del límite: true, y registra el intento', async () => {
    const client = mockAdminClient(2);
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const allowed = await checkRateLimit({ key: 'leads:ip:1.2.3.4', windowSeconds: 600, max: 5 });
    expect(allowed).toBe(true);
    expect(client.insert).toHaveBeenCalledWith({ key: 'leads:ip:1.2.3.4' });
  });

  it('en el límite: false, y NO registra un intento nuevo', async () => {
    const client = mockAdminClient(5);
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    const allowed = await checkRateLimit({ key: 'leads:ip:1.2.3.4', windowSeconds: 600, max: 5 });
    expect(allowed).toBe(false);
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('housekeeping: con Math.random() bajo el umbral, borra hits viejos', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.001);
    const client = mockAdminClient(0);
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    await checkRateLimit({ key: 'k', windowSeconds: 600, max: 5 });
    expect(client.delete).toHaveBeenCalled();
  });

  it('housekeeping: con Math.random() sobre el umbral, no borra nada', async () => {
    const client = mockAdminClient(0);
    vi.mocked(createAdminClient).mockReturnValue(client as never);
    await checkRateLimit({ key: 'k', windowSeconds: 600, max: 5 });
    expect(client.delete).not.toHaveBeenCalled();
  });
});

describe('rateLimitOrRespond', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dentro del límite: null (nada que responder)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient(0) as never);
    expect(await rateLimitOrRespond({ key: 'k', windowSeconds: 60, max: 3 })).toBeNull();
  });

  it('se pasó del límite: 429 con el mensaje (custom o default)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClient(3) as never);
    const res = await rateLimitOrRespond({ key: 'k', windowSeconds: 60, max: 3 }, 'Esperá un toque');
    expect(res).not.toBeNull();
    expect(res!.status).toBe(429);
    expect((await res!.json()).error).toBe('Esperá un toque');
  });
});
