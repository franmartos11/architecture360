import { describe, expect, it } from 'vitest';
import { borrarTokenChat, leerTokenChat, guardarTokenChat, DIAS_CHAT } from './web-token';

function storage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() { return m.size; },
  };
}
const T = '11111111-1111-4111-8111-111111111111';
const DIA = 86_400_000;

describe('token del chat web', () => {
  it('guarda y lee por proyecto', () => {
    const s = storage();
    guardarTokenChat(s, 'torre-sol', T, 1000);
    expect(s.getItem('atrium_chat_torre-sol')).toBe(JSON.stringify({ token: T, at: 1000 }));
    expect(leerTokenChat(s, 'torre-sol', 1000 + DIA)).toBe(T);
    expect(leerTokenChat(s, 'otro', 1000)).toBeNull();
  });

  it(`vence a los ${DIAS_CHAT} días`, () => {
    const s = storage();
    guardarTokenChat(s, 'torre-sol', T, 0);
    expect(leerTokenChat(s, 'torre-sol', 30 * DIA)).toBe(T);
    expect(leerTokenChat(s, 'torre-sol', 31 * DIA)).toBeNull();
  });

  it('basura o un storage que tira: null sin romper', () => {
    const s = storage();
    s.setItem('atrium_chat_torre-sol', '{no json');
    expect(leerTokenChat(s, 'torre-sol', 0)).toBeNull();
    const roto = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() { throw new Error('bloqueado'); } } as unknown as Storage;
    expect(leerTokenChat(roto, 'torre-sol', 0)).toBeNull();
    expect(() => guardarTokenChat(roto, 'torre-sol', T, 0)).not.toThrow();
    expect(() => borrarTokenChat(roto, 'torre-sol')).not.toThrow();
    expect(leerTokenChat(null, 'torre-sol', 0)).toBeNull();
  });

  it('borrar', () => {
    const s = storage();
    guardarTokenChat(s, 'torre-sol', T, 0);
    borrarTokenChat(s, 'torre-sol');
    expect(leerTokenChat(s, 'torre-sol', 0)).toBeNull();
  });
});
