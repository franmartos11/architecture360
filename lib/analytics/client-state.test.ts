import { describe, it, expect } from 'vitest';
import {
  safeStorage, getVisitorId, touchSession, captureRef, currentRef, referrerHost, shouldTrack, type KV,
} from './client-state';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MIN = 60_000;
const DAY = 86_400_000;

function memory(): KV {
  const m = new Map<string, string>();
  return { getItem: k => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
}

describe('getVisitorId', () => {
  it('genera un uuid y lo mantiene entre llamadas', () => {
    const s = memory();
    const a = getVisitorId(s);
    expect(a).toMatch(UUID);
    expect(getVisitorId(s)).toBe(a);
  });
});

describe('touchSession', () => {
  it('misma sesión a los 29 min, nueva a los 31 min sin actividad', () => {
    const s = memory();
    const t0 = 1_700_000_000_000;
    const a = touchSession(s, t0);
    expect(a).toMatch(UUID);
    expect(touchSession(s, t0 + 29 * MIN)).toBe(a);
    // la actividad a los 29 renueva: 31 min después de t0 son 2 desde el último
    expect(touchSession(s, t0 + 31 * MIN)).toBe(a);
    expect(touchSession(s, t0 + 31 * MIN + 31 * MIN)).not.toBe(a);
  });
});

describe('captureRef / currentRef (first-touch 90 días)', () => {
  const t0 = 1_700_000_000_000;

  it('guarda el ref en minúsculas', () => {
    const s = memory();
    captureRef(s, '?ref=Perez', t0);
    expect(currentRef(s, t0)).toBe('perez');
  });

  it('gana el primero: un ref nuevo a los 7 días no lo pisa', () => {
    const s = memory();
    captureRef(s, '?ref=perez', t0);
    captureRef(s, '?ref=instagram', t0 + 7 * DAY);
    expect(currentRef(s, t0 + 7 * DAY)).toBe('perez');
  });

  it('pasados 90 días, el próximo ref lo reemplaza', () => {
    const s = memory();
    captureRef(s, '?ref=perez', t0);
    captureRef(s, '?ref=instagram', t0 + 91 * DAY);
    expect(currentRef(s, t0 + 91 * DAY)).toBe('instagram');
  });

  it('vencido y sin ref nuevo: no hay canal', () => {
    const s = memory();
    captureRef(s, '?ref=perez', t0);
    expect(currentRef(s, t0 + 91 * DAY)).toBeNull();
  });

  it('utm_source sirve cuando no hay ref; con ambos gana ref', () => {
    const a = memory();
    captureRef(a, '?utm_source=Facebook&utm_medium=cpc', t0);
    expect(currentRef(a, t0)).toBe('facebook');
    const b = memory();
    captureRef(b, '?utm_source=facebook&ref=perez', t0);
    expect(currentRef(b, t0)).toBe('perez');
  });

  it('normaliza igual que el slug de un canal (guion bajo, tildes, espacios)', () => {
    const a = memory();
    captureRef(a, '?utm_source=Facebook_Ads', t0);
    expect(currentRef(a, t0)).toBe('facebook-ads');
    const b = memory();
    captureRef(b, '?ref=P%C3%A9rez%20Propiedades', t0);
    expect(currentRef(b, t0)).toBe('perez-propiedades');
  });

  it('sin ref ni utm_source no guarda nada', () => {
    const s = memory();
    captureRef(s, '?tab=plano', t0);
    expect(currentRef(s, t0)).toBeNull();
  });

  it('recorta a 60 caracteres', () => {
    const s = memory();
    captureRef(s, `?ref=${'x'.repeat(100)}`, t0);
    expect(currentRef(s, t0)).toHaveLength(60);
  });
});

describe('referrerHost', () => {
  it('host sin www', () => {
    expect(referrerHost('https://www.google.com/search?q=x', 'torre.com')).toBe('google.com');
  });
  it('mismo sitio o vacío: null', () => {
    expect(referrerHost('https://torre.com/unidades', 'torre.com')).toBeNull();
    expect(referrerHost('', 'torre.com')).toBeNull();
    expect(referrerHost('no es una url', 'torre.com')).toBeNull();
  });
});

describe('shouldTrack', () => {
  it('no registra en borrador ni en un iframe del mismo sitio', () => {
    expect(shouldTrack({ isDraftPreview: true, inSameOriginFrame: false })).toBe(false);
    expect(shouldTrack({ isDraftPreview: false, inSameOriginFrame: true })).toBe(false);
    expect(shouldTrack({ isDraftPreview: false, inSameOriginFrame: false })).toBe(true);
  });
});

describe('safeStorage', () => {
  it('si el storage tira (Safari privado), no rompe y mantiene ids en la pestaña', () => {
    const roto: KV = {
      getItem: () => { throw new Error('SecurityError'); },
      setItem: () => { throw new Error('QuotaExceededError'); },
    };
    const s = safeStorage(roto);
    const a = getVisitorId(s);
    expect(a).toMatch(UUID);
    expect(getVisitorId(s)).toBe(a);
    captureRef(s, '?ref=perez', 0);
    expect(currentRef(s, 0)).toBe('perez');
  });
});
