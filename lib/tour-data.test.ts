import { describe, it, expect } from 'vitest';
import { setNodeInitialView } from './tour-data';
import type { TourData } from '@/types';

const make = (): TourData => ({
  initialNodeId: 'a',
  nodes: [
    { id: 'a', name: 'A', imageUrl: 'a.jpg', initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 } },
    { id: 'b', name: 'B', imageUrl: 'b.jpg', initialView: { yaw: 1, pitch: 0.2, fov: 1.2 } },
  ],
});

describe('setNodeInitialView', () => {
  it('actualiza solo el nodo indicado sin mutar el original', () => {
    const original = make();
    const copiaPrevia = make();
    const view = { yaw: 2.5, pitch: -0.3, fov: 1.1 };
    const next = setNodeInitialView(original, 'b', view);
    expect(next.nodes[1].initialView).toEqual(view);
    expect(next.nodes[0]).toBe(original.nodes[0]);
    expect(next).not.toBe(original);
    expect(original).toEqual(copiaPrevia);
  });

  it('con un nodeId inexistente devuelve el mismo objeto', () => {
    const original = make();
    expect(setNodeInitialView(original, 'zzz', { yaw: 1, pitch: 1, fov: 1 })).toBe(original);
  });
});
