import { describe, expect, it } from 'vitest';
import { conversion, costoWebUsd, resumenCostoIa, serieDiaria, unidadesMasPedidas } from './metricas';

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

describe('resumenCostoIa', () => {
  const fila = (o: Partial<Parameters<typeof resumenCostoIa>[0][number]>) => ({
    origen: 'respuesta',
    conversacion_id: 'c1',
    modelo: 'claude-opus-5-5',
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    ...o,
  });

  it('suma el bot real, separa el simulador y calcula por conversación y la caché', () => {
    const c = resumenCostoIa([
      fila({ conversacion_id: 'c1', output_tokens: 1_000_000 }), // 20 USD
      fila({ conversacion_id: 'c2', input_tokens: 1_000_000, cache_read_tokens: 3_000_000 }), // 4 + 0,6
      fila({ origen: 'seguimiento', conversacion_id: 'c2', input_tokens: 0 }),
      fila({ origen: 'simulador', conversacion_id: null, output_tokens: 1_000_000 }), // 20, aparte
    ]);
    expect(c.usd).toBeCloseTo(24.6, 6);
    expect(c.turnos).toBe(3);
    expect(c.conversaciones).toBe(2);
    expect(c.usdPorConversacion).toBeCloseTo(12.3, 6);
    expect(c.cachePct).toBe(75);
    expect(c.simuladorUsd).toBeCloseTo(20, 6);
    expect(c.incompleto).toBe(false);
  });

  it('un modelo sin precio no suma y avisa que el total está incompleto', () => {
    const c = resumenCostoIa([fila({ modelo: 'claude-nuevo', output_tokens: 10 }), fila({ output_tokens: 1_000_000 })]);
    expect(c.usd).toBeCloseTo(20, 6);
    expect(c.incompleto).toBe(true);
  });

  it('sin filas: todo vacío, sin dividir por cero', () => {
    expect(resumenCostoIa([])).toEqual({
      usd: null, incompleto: false, turnos: 0, conversaciones: 0, usdPorConversacion: null, cachePct: null, simuladorUsd: null,
    });
  });
});

describe('chat del sitio en el costo', () => {
  const fila = (o: Record<string, unknown>) => ({
    origen: 'respuesta', conversacion_id: 'c1', modelo: 'claude-opus-5-5',
    input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0, ...o,
  });

  it('el costo del bot de WhatsApp no suma los turnos del chat web', () => {
    const c = resumenCostoIa([fila({ output_tokens: 1_000_000 }), fila({ origen: 'web', conversacion_id: 'w1', output_tokens: 1_000_000 })]);
    expect(c.usd).toBeCloseTo(20, 6);
    expect(c.turnos).toBe(1);
    expect(c.conversaciones).toBe(1);
  });

  it('costoWebUsd suma solo el origen web; null si no hubo turnos con precio', () => {
    expect(costoWebUsd([fila({ output_tokens: 1_000_000 }), fila({ origen: 'web', output_tokens: 500_000 })])).toBeCloseTo(10, 6);
    expect(costoWebUsd([fila({ output_tokens: 1 })])).toBeNull();
  });
});
