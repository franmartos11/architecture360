// Dónde abrir una tarjeta anclada a un punto (el pin de una torre en la
// fachada) para que entre completa en su contenedor. Antes la tarjeta se
// abría siempre hacia arriba y solo se corregía de costado: en un celular
// horizontal (≈317 px de alto) quedaba cortada bajo la barra.
//
// Orden de preferencia: arriba (lo natural: el pin queda a la vista
// debajo), abajo, a la derecha, a la izquierda. Si no entra en ningún lado,
// se encaja dentro del contenedor y la flecha se oculta (ya no apunta al
// pin).

export type PopoverSide = 'above' | 'below' | 'right' | 'left' | 'inside';

export interface PopoverPlacement {
  /** Esquina superior izquierda de la tarjeta, en px del contenedor. */
  left: number;
  top: number;
  side: PopoverSide;
  /** Dónde va la flecha sobre el borde de la tarjeta, en px (eje del borde). */
  caretOffset: number | null;
}

export function placePopover({
  anchorX, anchorY, width, height, containerW, containerH, gap = 16, margin = 12,
}: {
  anchorX: number; anchorY: number;
  width: number; height: number;
  containerW: number; containerH: number;
  gap?: number; margin?: number;
}): PopoverPlacement {
  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
  const centeredLeft = clamp(anchorX - width / 2, margin, containerW - width - margin);
  const centeredTop = clamp(anchorY - height / 2, margin, containerH - height - margin);
  const fitsX = width + margin * 2 <= containerW;

  if (fitsX && anchorY - gap - height >= margin) {
    return { left: centeredLeft, top: anchorY - gap - height, side: 'above', caretOffset: anchorX - centeredLeft };
  }
  if (fitsX && anchorY + gap + height <= containerH - margin) {
    return { left: centeredLeft, top: anchorY + gap, side: 'below', caretOffset: anchorX - centeredLeft };
  }
  const fitsY = height + margin * 2 <= containerH;
  if (fitsY && anchorX + gap + width <= containerW - margin) {
    return { left: anchorX + gap, top: centeredTop, side: 'right', caretOffset: anchorY - centeredTop };
  }
  if (fitsY && anchorX - gap - width >= margin) {
    return { left: anchorX - gap - width, top: centeredTop, side: 'left', caretOffset: anchorY - centeredTop };
  }
  return {
    left: clamp(anchorX - width / 2, margin, Math.max(margin, containerW - width - margin)),
    top: clamp(anchorY - height / 2, margin, Math.max(margin, containerH - height - margin)),
    side: 'inside',
    caretOffset: null,
  };
}
