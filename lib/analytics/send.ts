import type { TrackPayload } from './track-schema';

/**
 * Manda un evento a /api/track sin esperar nada. sendBeacon sobrevive al
 * cierre de la pestaña; si no existe o lo rechaza, fetch keepalive. Nunca tira.
 */
export function sendEvent(p: TrackPayload): void {
  try {
    const body = JSON.stringify(p);
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
      && navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))) {
      return;
    }
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true })
      .catch(() => {});
  } catch {
    /* la analítica nunca rompe el sitio */
  }
}
