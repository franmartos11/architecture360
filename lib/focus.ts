// Qué puede recibir foco dentro de un menú o un modal — lo comparten
// Popover (foco al primer ítem, flechas) y Dialog (foco inicial y Tab
// atrapado). La lista es la de los controles comunes del proyecto; los
// `tabindex="-1"` quedan afuera a propósito: son paneles que se enfocan por
// código, no paradas del Tab.

const SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos enfocables dentro de `root`, en orden de documento. */
export function getFocusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTOR)).filter(
    el => !el.hasAttribute('inert') && el.closest('[inert]') === null && el.getAttribute('aria-hidden') !== 'true',
  );
}

/** Enfoca sin que la página scrollee hasta el elemento (el modal o el menú
 *  ya están a la vista; el scroll de fondo está congelado). */
export function focusQuiet(el: HTMLElement | null | undefined) {
  el?.focus({ preventScroll: true });
}
