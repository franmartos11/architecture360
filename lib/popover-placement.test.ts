import { describe, it, expect } from 'vitest';
import { placePopover } from './popover-placement';

const card = { width: 256, height: 190 };

describe('placePopover', () => {
  it('arriba del pin cuando entra (celular vertical)', () => {
    const p = placePopover({ ...card, anchorX: 195, anchorY: 420, containerW: 390, containerH: 770 });
    expect(p.side).toBe('above');
    expect(p.top).toBe(420 - 16 - 190);
  });

  it('abajo cuando arriba no hay lugar', () => {
    const p = placePopover({ ...card, anchorX: 195, anchorY: 120, containerW: 390, containerH: 770 });
    expect(p.side).toBe('below');
    expect(p.top).toBe(120 + 16);
  });

  it('al costado en un celular horizontal (no entra ni arriba ni abajo)', () => {
    const p = placePopover({ ...card, anchorX: 395, anchorY: 140, containerW: 844, containerH: 317 });
    expect(p.side).toBe('right');
    expect(p.left).toBe(395 + 16);
    expect(p.top).toBeGreaterThanOrEqual(12);
    expect(p.top + card.height).toBeLessThanOrEqual(317 - 12);
  });

  it('a la izquierda si a la derecha no entra', () => {
    const p = placePopover({ ...card, anchorX: 700, anchorY: 140, containerW: 844, containerH: 317 });
    expect(p.side).toBe('left');
    expect(p.left + card.width).toBe(700 - 16);
  });

  it('nunca se sale del contenedor por los costados', () => {
    const p = placePopover({ ...card, anchorX: 20, anchorY: 500, containerW: 390, containerH: 770 });
    expect(p.left).toBe(12);
    expect(p.caretOffset).toBe(8); // la flecha sigue apuntando al pin
  });

  it('sin lugar en ningún lado: adentro y sin flecha', () => {
    const p = placePopover({ ...card, anchorX: 150, anchorY: 100, containerW: 300, containerH: 200 });
    expect(p.side).toBe('inside');
    expect(p.caretOffset).toBeNull();
    expect(p.left).toBeGreaterThanOrEqual(12);
  });
});
