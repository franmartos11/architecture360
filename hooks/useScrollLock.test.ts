// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollLock } from './useScrollLock';

describe('useScrollLock', () => {
  beforeEach(() => {
    document.body.style.cssText = '';
    window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1024, writable: true, configurable: true });
  });

  afterEach(() => { document.body.style.cssText = ''; });

  it('no toca el body mientras está desbloqueado', () => {
    renderHook(() => useScrollLock(false));
    expect(document.body.style.position).toBe('');
  });

  it('fija el body al bloquear (no alcanza overflow:hidden en iOS)', () => {
    renderHook(() => useScrollLock(true));
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.width).toBe('100%');
  });

  it('guarda la posición del scroll en top, en negativo', () => {
    Object.defineProperty(window, 'scrollY', { value: 420, writable: true, configurable: true });
    renderHook(() => useScrollLock(true));
    expect(document.body.style.top).toBe('-420px');
  });

  it('al desmontar devuelve el body y el scroll a donde estaban', () => {
    Object.defineProperty(window, 'scrollY', { value: 250, writable: true, configurable: true });
    const { unmount } = renderHook(() => useScrollLock(true));

    unmount();

    expect(document.body.style.position).toBe('');
    expect(document.body.style.top).toBe('');
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 250, behavior: 'instant' });
  });

  it('compensa el ancho de la barra de scroll para que no salte el layout', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1009, writable: true, configurable: true });

    renderHook(() => useScrollLock(true));

    expect(document.body.style.paddingRight).toBe('15px');
  });

  it('sin barra de scroll (touch) no agrega padding', () => {
    renderHook(() => useScrollLock(true));
    expect(document.body.style.paddingRight).toBe('');
  });

  it('respeta los estilos que el body ya tenía', () => {
    document.body.style.paddingRight = '8px';
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(document.documentElement, 'clientWidth', { value: 1009, writable: true, configurable: true });

    const { unmount } = renderHook(() => useScrollLock(true));
    expect(document.body.style.paddingRight).toBe('15px');

    unmount();
    expect(document.body.style.paddingRight).toBe('8px');
  });
});
