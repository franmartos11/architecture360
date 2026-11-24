import { describe, it, expect } from 'vitest';
import { calculatorModels } from './calculator-models';
import type { Unit } from '@/types';

const u = (over: Partial<Unit>): Unit => ({ status: 'available', price: 100, currency: 'USD', type: '2 dormitorios', modelName: '', totalArea: 50, ...over } as Unit);

describe('calculatorModels', () => {
  it('un modelo por tipología con su precio más bajo disponible', () => {
    const models = calculatorModels([
      u({ modelName: 'Duet', price: 120 }), u({ modelName: 'Duet', price: 110 }), u({ modelName: 'Solo', price: 90 }),
      u({ modelName: 'Duet', price: 50, status: 'sold' }),
    ], false);
    expect(models).toEqual([
      { label: 'Solo', price: 90, currency: 'USD' },
      { label: 'Duet', price: 110, currency: 'USD' },
    ]);
  });

  it('loteo: agrupa por superficie del lote', () => {
    const models = calculatorModels([
      u({ type: 'Lote', totalArea: 600, price: 30_000 }), u({ type: 'Lote', totalArea: 600, price: 28_000 }),
      u({ type: 'Lote', totalArea: 1000, price: 45_000 }),
    ], true);
    expect(models.map(m => m.label)).toEqual(['Lote de 600 m²', 'Lote de 1.000 m²']);
    expect(models[0].price).toBe(28_000);
  });

  it('máximo 6 modelos y sin unidades sin precio', () => {
    const many = Array.from({ length: 9 }, (_, i) => u({ modelName: `M${i}`, price: 100 + i }));
    expect(calculatorModels([...many, u({ modelName: 'X', price: undefined })], false)).toHaveLength(6);
  });
});

describe('calculatorModels — lote sin superficie', () => {
  it('cae al tipo en vez de "Lote de 0 m²"', () => {
    expect(calculatorModels([u({ type: 'Lote', totalArea: 0, price: 10 })], true)[0].label).toBe('Lote');
  });
});
