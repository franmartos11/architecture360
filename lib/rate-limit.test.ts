import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));

import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, rateLimitOrRespond } from './rate-limit';

// Cliente cuya función check_rate_limit NO existe todavía en la base: así
// estos casos siguen ejercitando el camino de respaldo (las dos consultas).
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
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: '42883', message: 'function does not exist' } });
  return { from, insert, delete: del, rpc };
}

/** Cliente con la función ya aplicada: devuelve lo que decida Postgres. */
function mockAdminClientConRpc(permitido: boolean) {
  const insert = vi.fn();
  const from = vi.fn(() => ({ select: () => ({ eq: () => ({ gte: () => Promise.resolve({ count: 0 }) }) }), insert }));
  const rpc = vi.fn().mockResolvedValue({ data: permitido, error: null });
  return { from, insert, rpc };
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

  it('con la función en la base: resuelve en una sola llamada y no consulta la tabla', async () => {
    const client = mockAdminClientConRpc(true);
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    const allowed = await checkRateLimit({ key: 'leads:ip:9.9.9.9', windowSeconds: 600, max: 5 });

    expect(allowed).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith('check_rate_limit', {
      p_key: 'leads:ip:9.9.9.9', p_window_seconds: 600, p_max: 5,
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.insert).not.toHaveBeenCalled();
  });

  it('con la función en la base: si Postgres dice que se pasó, devuelve false', async () => {
    vi.mocked(createAdminClient).mockReturnValue(mockAdminClientConRpc(false) as never);
    expect(await checkRateLimit({ key: 'k', windowSeconds: 60, max: 3 })).toBe(false);
  });

  it('sin la función todavía: cae al camino de dos pasos en vez de romper', async () => {
    const client = mockAdminClient(0);
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    expect(await checkRateLimit({ key: 'k', windowSeconds: 60, max: 3 })).toBe(true);
    expect(client.insert).toHaveBeenCalled();
  });

  it('ante un error real de la base no deja pasar: falla fuerte', async () => {
    const client = {
      ...mockAdminClient(0),
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '57P01', message: 'server closed the connection' } }),
    };
    vi.mocked(createAdminClient).mockReturnValue(client as never);

    await expect(checkRateLimit({ key: 'k', windowSeconds: 60, max: 3 })).rejects.toThrow(/server closed/);
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
