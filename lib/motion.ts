// Movimiento del sitio público y del panel — un solo juego de curvas y
// resortes para que hojas, menús, modales, selectores y apariciones se
// sientan de la misma familia. Regla de la casa: nada se mueve sin una
// acción de la persona, y con `prefers-reduced-motion` todo pasa a ser un
// fundido corto (o nada) — ver `reducedOr` y `REDUCED_FADE`.

import type { Transition } from 'framer-motion';

/** Salida suave y decidida: arranca rápido y se asienta sin rebote. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Hojas que suben desde abajo (y vuelven a su lugar tras arrastrarlas). */
export const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const;

/** Indicadores que se deslizan entre opciones (selectores segmentados). */
export const PILL_SPRING = { type: 'spring', stiffness: 520, damping: 40, mass: 0.7 } as const;

/** Cambio de contenido (la tarjeta de lo elegido, la vista de la imagen). */
export const SWAP = { duration: 0.24, ease: EASE_OUT } as const;

/** Fondo atenuado detrás de una hoja o un modal. */
export const BACKDROP = { duration: 0.22, ease: 'easeOut' } as const;

/** Menús y popovers anclados a un botón: aparecen enseguida, junto a la
 *  mano que los abrió (ver components/ui/Popover.tsx). */
export const POPOVER = { duration: 0.16, ease: EASE_OUT } as const;
/** Salida de un menú: más corta que la entrada, para no estorbar lo que
 *  viene después (el clic ya se hizo). */
export const POPOVER_OUT = { duration: 0.1, ease: 'easeIn' } as const;

/** Entrada de un modal centrado (components/ui/Dialog.tsx): escala y
 *  opacidad; un toque más largo que un menú porque tapa toda la pantalla. */
export const DIALOG = { duration: 0.22, ease: EASE_OUT } as const;
/** Salida del modal: se va rápido, sin hacer esperar. */
export const DIALOG_OUT = { duration: 0.15, ease: 'easeIn' } as const;

/** Altura de acordeones y subítems que se despliegan (components/ui/Collapse.tsx). */
export const EXPAND = { duration: 0.24, ease: EASE_OUT } as const;

/** Contenido que reemplaza a un skeleton al terminar de cargar
 *  (components/ui/Loaded.tsx): sube `CONTENT_IN_Y` px mientras aparece. */
export const CONTENT_IN = { duration: 0.22, ease: EASE_OUT } as const;
export const CONTENT_IN_Y = 6;

/** Acercamiento lento de una foto al pasar el mouse (tarjetas, galerías):
 *  tan lento que se siente como profundidad, no como un efecto. */
export const HOVER_SLOW = { duration: 0.7, ease: EASE_OUT } as const;

/** Lo único que queda con movimiento reducido en menús y modales: un
 *  fundido breve de opacidad, sin desplazamiento ni escala. */
export const REDUCED_FADE = { duration: 0.12 } as const;

/** Con movimiento reducido, la transición pasa a ser instantánea. */
export const reducedOr = (reduced: boolean, transition: Transition): Transition =>
  reduced ? { duration: 0 } : transition;

/** Entrada escalonada de una lista corta: cada ítem, un poco después. */
export const stagger = (i: number, reduced: boolean) =>
  reduced ? { duration: 0 } : { duration: 0.3, ease: EASE_OUT, delay: Math.min(i, 10) * 0.03 };
