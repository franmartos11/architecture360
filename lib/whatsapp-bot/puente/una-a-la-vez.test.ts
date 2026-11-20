import { describe, expect, it, vi } from 'vitest';
import { UnaALaVez } from './una-a-la-vez';

describe('UnaALaVez', () => {
  it('no espera la tarea: vuelve enseguida aunque la tarea no termine nunca', () => {
    const u = new UnaALaVez();
    expect(u.correr(() => new Promise(() => {}))).toBe(true);
    expect(u.ocupada).toBe(true);
  });

  it('mientras una sigue en curso, las nuevas se saltean (no se apilan)', async () => {
    const u = new UnaALaVez();
    let soltar!: () => void;
    const fn = vi.fn(() => new Promise<void>((r) => (soltar = r)));
    expect(u.correr(fn)).toBe(true);
    expect(u.correr(fn)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    soltar();
    await vi.waitFor(() => expect(u.ocupada).toBe(false));
    expect(u.correr(fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('una tarea colgada de un bot no frena a otra instancia (otro bot)', () => {
    const colgado = new UnaALaVez();
    const sano = new UnaALaVez();
    colgado.correr(() => new Promise(() => {}));
    const fn = vi.fn(async () => {});
    expect(sano.correr(fn)).toBe(true);
    expect(fn).toHaveBeenCalled();
  });

  it('si la tarea rechaza (o tira al arrancar) lo loguea y queda libre', async () => {
    const log = vi.fn();
    const u = new UnaALaVez(log);
    u.correr(async () => {
      throw new Error('x');
    });
    await vi.waitFor(() => expect(u.ocupada).toBe(false));
    u.correr(() => {
      throw new Error('y');
    });
    await vi.waitFor(() => expect(u.ocupada).toBe(false));
    expect(log).toHaveBeenCalledTimes(2);
  });
});
