import { describe, expect, it } from 'vitest';
import { costoEstimadoUsd, sumarUso, USO_VACIO } from './uso';

describe('sumarUso', () => {
  it('trata como 0 los campos de caché que vienen null', () => {
    const u = sumarUso(USO_VACIO, {
      model: 'claude-opus-5-5',
      usage: { input_tokens: 10, output_tokens: 2, cache_read_input_tokens: null, cache_creation_input_tokens: null } as never,
    });
    expect(u).toMatchObject({ llamadas: 1, inputTokens: 10, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 });
  });
});

describe('costoEstimadoUsd', () => {
  it('Opus 5.5: entrada 4, salida 20, lectura de caché 0,20 y escritura 5 USD por millón', () => {
    const usd = costoEstimadoUsd({
      modelo: 'claude-opus-5-5',
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(4 + 20 + 0.2 + 5, 6);
  });

  it('un turno típico: unos centavos', () => {
    const usd = costoEstimadoUsd({ modelo: 'claude-opus-5-5', inputTokens: 300, outputTokens: 400, cacheReadTokens: 12_000, cacheWriteTokens: 800 });
    expect(usd).toBeCloseTo((300 * 4 + 400 * 20 + 12_000 * 0.2 + 800 * 5) / 1e6, 9);
  });

  it('modelo sin precio cargado (o sin modelo): null, no inventa', () => {
    expect(costoEstimadoUsd({ modelo: 'claude-desconocido', inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
    expect(costoEstimadoUsd({ modelo: null, inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBeNull();
  });
});
