// Estado del visitante del sitio público para la analítica: id anónimo,
// sesión y canal atribuido (first-touch). Todo en localStorage, sin cookies.
// Lógica pura sobre un KV para poder probarla sin navegador; el tracker y los
// formularios usan safeStorage() (localStorage con respaldo en memoria).
// Spec: docs/superpowers/specs/2026-11-24-analitica-y-links-de-broker-design.md

import { normalizeRef } from './ref';

export type KV = Pick<Storage, 'getItem' | 'setItem'>;

const VISITOR_KEY = 'atrium_vid';
const SESSION_KEY = 'atrium_sess';
const REF_KEY = 'atrium_ref';

const SESSION_IDLE_MS = 30 * 60_000;
const REF_TTL_MS = 90 * 86_400_000;

/** uuid v4; crypto.randomUUID no existe fuera de contextos seguros (http en una IP de la red). */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function wrap(base: KV | null): KV {
  // Respaldo en memoria: si el storage tira (Safari privado, iframe de un
  // tercero con storage bloqueado) los ids siguen siendo estables en la pestaña.
  const mem = new Map<string, string>();
  return {
    getItem(k) {
      try {
        const v = base?.getItem(k);
        if (v != null) return v;
      } catch { /* sin storage */ }
      return mem.get(k) ?? null;
    },
    setItem(k, v) {
      mem.set(k, v);
      try { base?.setItem(k, v); } catch { /* sin storage */ }
    },
  };
}

let shared: KV | null = null;

/** localStorage a prueba de fallos. Sin argumento devuelve siempre la misma instancia. */
export function safeStorage(base?: KV): KV {
  if (base) return wrap(base);
  if (!shared) {
    let ls: KV | null = null;
    try { ls = typeof window !== 'undefined' ? window.localStorage : null; } catch { ls = null; }
    shared = wrap(ls);
  }
  return shared;
}

function readJson<T>(s: KV, key: string): T | null {
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getVisitorId(s: KV): string {
  const v = s.getItem(VISITOR_KEY);
  if (v) return v;
  const id = newId();
  s.setItem(VISITOR_KEY, id);
  return id;
}

/** Sesión vigente, o una nueva si pasaron más de 30 min desde el último evento. Renueva la hora. */
export function touchSession(s: KV, now: number): string {
  const prev = readJson<{ id: string; at: number }>(s, SESSION_KEY);
  const id = prev && now - prev.at <= SESSION_IDLE_MS ? prev.id : newId();
  s.setItem(SESSION_KEY, JSON.stringify({ id, at: now }));
  return id;
}

/** Guarda el canal de la URL (ref, o utm_source) solo si no hay uno vigente: gana el primero. */
export function captureRef(s: KV, search: string, now: number): void {
  const params = new URLSearchParams(search);
  const raw = normalizeRef(params.get('ref') || params.get('utm_source'));
  if (!raw) return;
  if (currentRef(s, now)) return;
  s.setItem(REF_KEY, JSON.stringify({ ref: raw, at: now }));
}

export function currentRef(s: KV, now: number): string | null {
  const saved = readJson<{ ref: string; at: number }>(s, REF_KEY);
  return saved && now - saved.at <= REF_TTL_MS ? saved.ref : null;
}

/** Host de donde vino la visita (sin www.), o null si es el mismo sitio o no hay. */
export function referrerHost(referrer: string, currentHost: string): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).hostname.replace(/^www\./, '');
    return host && host !== currentHost.replace(/^www\./, '') ? host : null;
  } catch {
    return null;
  }
}

export function shouldTrack(o: { isDraftPreview: boolean; inSameOriginFrame: boolean }): boolean {
  return !o.isDraftPreview && !o.inSameOriginFrame;
}

/** Lo que mandan los formularios de contacto junto con el lead. */
export function readAttribution(): { visitorId: string; ref: string | null } {
  const s = safeStorage();
  return { visitorId: getVisitorId(s), ref: currentRef(s, Date.now()) };
}
