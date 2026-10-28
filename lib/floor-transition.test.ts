import { describe, it, expect } from 'vitest';
import {
  floorDirection,
  floorSteps,
  floorTransitionMs,
  FLOOR_TRANSITION_BASE_MS,
  FLOOR_TRANSITION_MAX_MS,
  FLOOR_TRANSITION_REDUCED_MS,
} from './floor-transition';

describe('floorDirection', () => {
  it('sube, baja o se queda', () => {
    expect(floorDirection(1, 3)).toBe(1);
    expect(floorDirection(3, 0)).toBe(-1);
    expect(floorDirection(2, 2)).toBe(0);
  });

  it('subsuelos: de -1 a PB es subir', () => {
    expect(floorDirection(-1, 0)).toBe(1);
  });
});

describe('floorSteps', () => {
  const order = [0, 1, 2, 3, 10];

  it('cuenta pisos cargados, no la resta de números', () => {
    expect(floorSteps(order, 3, 10)).toBe(1);
    expect(floorSteps(order, 0, 10)).toBe(4);
  });

  it('sin el piso en la lista, cae a la resta', () => {
    expect(floorSteps(order, 3, 7)).toBe(4);
  });
});

describe('floorTransitionMs', () => {
  it('un piso dura la base', () => {
    expect(floorTransitionMs(1)).toBe(FLOOR_TRANSITION_BASE_MS);
  });

  it('más pisos dura más, con techo', () => {
    expect(floorTransitionMs(2)).toBeGreaterThan(floorTransitionMs(1));
    expect(floorTransitionMs(40)).toBe(FLOOR_TRANSITION_MAX_MS);
  });

  it('mismo piso no anima', () => {
    expect(floorTransitionMs(0)).toBe(0);
  });

  it('reducir movimiento: fundido corto, sin importar la distancia', () => {
    expect(floorTransitionMs(5, true)).toBe(FLOOR_TRANSITION_REDUCED_MS);
  });
});
