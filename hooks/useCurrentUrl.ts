import { useSyncExternalStore } from 'react';

// URL actual de la página, segura para renderizar en el servidor: ahí vale ''
// y al hidratar pasa a la real sin diferencia de markup (useSyncExternalStore
// usa el snapshot del servidor mientras hidrata). Antes esto era
// `typeof window !== 'undefined' ? window.location.href : ''` en el render,
// que da distinto en servidor y cliente.
//
// La URL no cambia por navegación dentro de la misma página (solo por
// replaceState, que no dispara ningún evento), así que no hay nada a qué
// suscribirse: se lee al montar.
const subscribe = () => () => {};
const getSnapshot = () => window.location.href;
const getServerSnapshot = () => '';

export function useCurrentUrl(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
