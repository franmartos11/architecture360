import { describe, it, expect } from 'vitest';
import { findSimilarUnits } from './similar-units';

interface TestUnit {
  id: string;
  buildingId: string;
  type: string;
  status: string;
}

const sold: TestUnit = { id: 'u1', buildingId: 'b1', type: '2 dormitorios', status: 'sold' };

describe('findSimilarUnits', () => {
  it('devuelve las disponibles del mismo edificio y tipología', () => {
    const all: TestUnit[] = [
      sold,
      { id: 'u2', buildingId: 'b1', type: '2 dormitorios', status: 'available' },
      { id: 'u3', buildingId: 'b1', type: '2 dormitorios', status: 'available' },
    ];
    expect(findSimilarUnits(sold, all).map(u => u.id)).toEqual(['u2', 'u3']);
  });

  it('nunca incluye la unidad de origen', () => {
    const available: TestUnit = { id: 'u1', buildingId: 'b1', type: '2 dormitorios', status: 'available' };
    expect(findSimilarUnits(available, [available]).map(u => u.id)).toEqual([]);
  });

  it('excluye otras tipologías', () => {
    const all: TestUnit[] = [sold, { id: 'u2', buildingId: 'b1', type: '1 dormitorio', status: 'available' }];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('excluye otros edificios', () => {
    const all: TestUnit[] = [sold, { id: 'u2', buildingId: 'b2', type: '2 dormitorios', status: 'available' }];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('excluye las que no están disponibles', () => {
    const all: TestUnit[] = [
      sold,
      { id: 'u2', buildingId: 'b1', type: '2 dormitorios', status: 'sold' },
      { id: 'u3', buildingId: 'b1', type: '2 dormitorios', status: 'reserved' },
    ];
    expect(findSimilarUnits(sold, all)).toEqual([]);
  });

  it('sin candidatas devuelve lista vacía', () => {
    expect(findSimilarUnits(sold, [sold])).toEqual([]);
  });
});
