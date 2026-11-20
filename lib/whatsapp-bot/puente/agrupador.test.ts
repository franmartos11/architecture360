import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agrupador } from './agrupador';

/** Promesa que se resuelve desde afuera (un turno de IA "en curso"). */
function pendiente() {
  let resolver!: () => void;
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Agrupador', () => {
  it('3 avisos en 5 s → un solo turno, 8 s después del último', async () => {
    const correr = vi.fn<(convId: string) => Promise<void>>(async () => {});
    const a = new Agrupador(8000, correr);
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(2500);
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(2500);
    a.avisar('c1'); // t = 5 s
    await vi.advanceTimersByTimeAsync(7999);
    expect(correr).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); // t = 13 s = último + 8 s
    expect(correr).toHaveBeenCalledTimes(1);
    expect(correr).toHaveBeenCalledWith('c1');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(correr).toHaveBeenCalledTimes(1);
  });

  it('conversaciones distintas no se agrupan entre sí', async () => {
    const correr = vi.fn<(convId: string) => Promise<void>>(async () => {});
    const a = new Agrupador(8000, correr);
    a.avisar('c1');
    a.avisar('c2');
    await vi.advanceTimersByTimeAsync(8000);
    expect(correr.mock.calls.map((c) => c[0]).sort()).toEqual(['c1', 'c2']);
  });

  it('un aviso durante un turno en curso dispara otro turno recién cuando termina el primero', async () => {
    const turnos: ReturnType<typeof pendiente>[] = [];
    let enParalelo = 0;
    let maxParalelo = 0;
    const correr = vi.fn<(convId: string) => Promise<void>>(async () => {
      enParalelo++;
      maxParalelo = Math.max(maxParalelo, enParalelo);
      const p = pendiente();
      turnos.push(p);
      await p.promesa;
      enParalelo--;
    });
    const a = new Agrupador(8000, correr);
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(8000);
    expect(correr).toHaveBeenCalledTimes(1);

    // El cliente escribe mientras la IA responde.
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(8000);
    // Ya pasaron los 8 s, pero el primer turno sigue: no arranca otro.
    expect(correr).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(correr).toHaveBeenCalledTimes(1);

    turnos[0].resolver();
    await vi.advanceTimersByTimeAsync(0);
    expect(correr).toHaveBeenCalledTimes(2);
    turnos[1].resolver();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(correr).toHaveBeenCalledTimes(2);
    expect(maxParalelo).toBe(1);
  });

  it('si el turno termina antes de que venza la espera del nuevo aviso, el segundo corre al vencer', async () => {
    const turnos: ReturnType<typeof pendiente>[] = [];
    const correr = vi.fn<(convId: string) => Promise<void>>(async () => {
      const p = pendiente();
      turnos.push(p);
      await p.promesa;
    });
    const a = new Agrupador(8000, correr);
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(8000);
    a.avisar('c1'); // t = 8 s, vence a los 16 s
    await vi.advanceTimersByTimeAsync(2000);
    turnos[0].resolver(); // t = 10 s
    await vi.advanceTimersByTimeAsync(0);
    expect(correr).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000); // t = 16 s
    expect(correr).toHaveBeenCalledTimes(2);
  });

  it('un turno que falla no traba la conversación', async () => {
    const correr = vi
      .fn<(convId: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('se cayó la API'))
      .mockResolvedValue(undefined);
    const log = vi.fn();
    const a = new Agrupador(8000, correr, log);
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(8000);
    expect(log).toHaveBeenCalled();
    a.avisar('c1');
    await vi.advanceTimersByTimeAsync(8000);
    expect(correr).toHaveBeenCalledTimes(2);
  });

  it('detener() cancela las esperas pendientes', async () => {
    const correr = vi.fn<(convId: string) => Promise<void>>(async () => {});
    const a = new Agrupador(8000, correr);
    a.avisar('c1');
    a.detener();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(correr).not.toHaveBeenCalled();
  });
});
