import { describe, expect, it } from 'vitest';
import { crearSerie } from './serie';

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('crearSerie', () => {
  it('misma clave: de a una y en orden de llegada', async () => {
    const enSerie = crearSerie();
    const orden: string[] = [];
    await Promise.all([
      enSerie('c1', async () => {
        orden.push('a-in');
        await dormir(10);
        orden.push('a-out');
      }),
      enSerie('c1', async () => {
        orden.push('b-in');
        orden.push('b-out');
      }),
    ]);
    expect(orden).toEqual(['a-in', 'a-out', 'b-in', 'b-out']);
  });

  it('claves distintas corren en paralelo', async () => {
    const enSerie = crearSerie();
    const orden: string[] = [];
    await Promise.all([
      enSerie('c1', async () => {
        orden.push('a-in');
        await dormir(10);
        orden.push('a-out');
      }),
      enSerie('c2', async () => {
        orden.push('b');
      }),
    ]);
    expect(orden).toEqual(['a-in', 'b', 'a-out']);
  });

  it('un error no corta la cadena y llega a quien lo pidió', async () => {
    const enSerie = crearSerie();
    await expect(enSerie('c1', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(enSerie('c1', async () => 7)).resolves.toBe(7);
  });
});
