import { describe, expect, it } from 'vitest';
import { leerPorLotes } from './datos';

describe('leerPorLotes', () => {
  it('trae todo (2500 filas, 250 ids) sin pedidos de más de 100 ids', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const porId = new Map(ids.map(id => [id, 10]));
    const tamanos: number[] = [];
    const filas = await leerPorLotes<{ id: string; n: number }>(
      ids,
      async (lote, desde, hasta) => {
        tamanos.push(lote.length);
        const todas = lote.flatMap(id => Array.from({ length: porId.get(id)! }, (_, n) => ({ id, n })));
        return { data: todas.slice(desde, hasta + 1), error: null };
      },
      'x',
    );
    expect(filas).toHaveLength(2500);
    expect(Math.max(...tamanos)).toBeLessThanOrEqual(100);
  });
  it('pagina dentro de un lote con más de 1000 filas', async () => {
    const todas = Array.from({ length: 2500 }, (_, i) => i);
    const filas = await leerPorLotes<number>(['a'], async (_l, d, h) => ({ data: todas.slice(d, h + 1), error: null }), 'x');
    expect(filas).toHaveLength(2500);
  });
  it('sin ids no consulta', async () => {
    expect(await leerPorLotes<number>([], async () => { throw new Error('no'); }, 'x')).toEqual([]);
  });
  it('propaga errores', async () => {
    await expect(leerPorLotes<number>(['a'], async () => ({ data: null, error: { message: 'boom' } }), 'las unidades')).rejects.toThrow(/las unidades.*boom/);
  });
});
