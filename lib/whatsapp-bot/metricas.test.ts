import { describe, expect, it } from 'vitest';
import { conversion, serieDiaria, unidadesMasPedidas } from './metricas';

describe('serieDiaria', () => {
  it('un día por fila (hora de Argentina), con ceros donde no hubo', () => {
    const ahora = new Date('2026-11-20T15:00:00.000Z');
    // 01:00 UTC del 20 = 22:00 del 19 en Argentina.
    const s = serieDiaria(['2026-11-20T01:00:00.000Z', '2026-11-20T14:00:00.000Z', '2026-11-18T12:00:00.000Z'], 3, ahora);
    expect(s).toEqual([
      { fecha: '2026-11-18', conversaciones: 1 },
      { fecha: '2026-11-19', conversaciones: 1 },
      { fecha: '2026-11-20', conversaciones: 1 },
    ]);
  });
});

describe('unidadesMasPedidas', () => {
  it('separa los códigos de cada lead y ordena por cantidad', () => {
    expect(unidadesMasPedidas(['2A, 3B', '2A', null, ' 3B ', '1C'], 2)).toEqual([
      { unidad: '2A', leads: 2 },
      { unidad: '3B', leads: 2 },
    ]);
  });
});

describe('conversion', () => {
  it('porcentaje redondeado; sin charlas o sin datos, null', () => {
    expect(conversion(3, 12)).toBe(25);
    expect(conversion(3, 0)).toBeNull();
    expect(conversion(null, 10)).toBeNull();
  });
});
