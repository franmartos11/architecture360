// Transición entre pisos del visor de plantas: hacia dónde se mueve la
// "cámara" y cuánto dura el viaje. Pura, para que la compartan los
// prototipos (app/prototipos/cambio-de-piso) y el visor real.

/** 1 = subir, -1 = bajar, 0 = mismo piso. */
export type FloorDirection = 1 | -1 | 0;

export function floorDirection(from: number, to: number): FloorDirection {
  return to > from ? 1 : to < from ? -1 : 0;
}

/**
 * Pisos de distancia en el orden real del edificio — no la resta de
 * números: entre el 1 y el 10 puede no haber nueve pisos cargados, y el
 * viaje se siente según los pisos que se "atraviesan" en la lista.
 */
export function floorSteps(order: number[], from: number, to: number): number {
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a === -1 || b === -1) return Math.abs(to - from);
  return Math.abs(b - a);
}

// Como un ascensor: más pisos = viaje algo más largo, pero con techo — la
// transición nunca debe sentirse como una espera. El techo deja ~70 ms para
// montar el piso nuevo en el visor real (marcadores, zoom) dentro de un
// presupuesto total de 450 ms, medido en un celular con la CPU 4× más lenta.
export const FLOOR_TRANSITION_BASE_MS = 280;
export const FLOOR_TRANSITION_STEP_MS = 40;
export const FLOOR_TRANSITION_MAX_MS = 380;
/** "Reducir movimiento": un fundido corto, sin desplazamiento. */
export const FLOOR_TRANSITION_REDUCED_MS = 150;

export function floorTransitionMs(steps: number, reducedMotion = false): number {
  if (reducedMotion) return FLOOR_TRANSITION_REDUCED_MS;
  if (steps <= 0) return 0;
  return Math.min(FLOOR_TRANSITION_MAX_MS, FLOOR_TRANSITION_BASE_MS + (steps - 1) * FLOOR_TRANSITION_STEP_MS);
}

/** Arranca lento y frena suave, como un ascensor (ease-in-out cúbica). */
export const ELEVATOR_EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];
