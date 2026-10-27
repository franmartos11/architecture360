import { describe, it, expect } from 'vitest';
import { PLAN_WHEEL, PLAN_DOUBLE_CLICK, PLAN_CONTENT_STYLE } from './plan-zoom';

// react-zoom-pan-pinch v4 (smooth: true) suma `step * |deltaY|` a la escala
// por cada evento de rueda. Un "clic" de rueda de mouse manda deltaY ≈ 100;
// un trackpad manda muchos eventos chicos (deltaY ≈ 2–10).
const scaleDeltaPerWheelEvent = (deltaY: number) => PLAN_WHEEL.step * Math.abs(deltaY);

describe('plan zoom config', () => {
  it('un clic de rueda de mouse acerca como mucho 25%', () => {
    expect(scaleDeltaPerWheelEvent(100)).toBeLessThanOrEqual(0.25);
  });

  it('hacen falta varios clics de rueda para llegar de 1x a 2x', () => {
    expect(Math.ceil(1 / scaleDeltaPerWheelEvent(100))).toBeGreaterThanOrEqual(4);
  });

  it('un evento de trackpad mueve el zoom de forma continua, no a saltos', () => {
    expect(scaleDeltaPerWheelEvent(10)).toBeLessThanOrEqual(0.03);
  });

  it('el doble click no más que duplica la escala (es exponencial: scale * e^step)', () => {
    expect(Math.exp(PLAN_DOUBLE_CLICK.step)).toBeLessThanOrEqual(2.1);
  });

  it('el contenido es un size container, para topear el plano con cqh/cqw', () => {
    expect(PLAN_CONTENT_STYLE.containerType).toBe('size');
  });
});
