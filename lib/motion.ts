// Movimiento del sitio público — un solo juego de curvas y resortes para
// que hojas, selectores y apariciones se sientan de la misma familia.

/** Salida suave y decidida: arranca rápido y se asienta sin rebote. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Hojas que suben desde abajo (y vuelven a su lugar tras arrastrarlas). */
export const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const;

/** Indicadores que se deslizan entre opciones (selectores segmentados). */
export const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 } as const;

/** Cambio de contenido (la tarjeta de lo elegido, la vista de la imagen). */
export const SWAP = { duration: 0.24, ease: EASE_OUT } as const;

/** Fondo atenuado detrás de una hoja. */
export const BACKDROP = { duration: 0.22, ease: 'easeOut' } as const;

/** Entrada escalonada de una lista corta: cada ítem, un poco después. */
export const stagger = (i: number, reduced: boolean) =>
  reduced ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT, delay: Math.min(i, 10) * 0.03 };
