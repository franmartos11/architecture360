// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useContactModal } from './useContactModal';

describe('useContactModal', () => {
  it('arranca cerrado, método "email" por defecto', () => {
    const { result } = renderHook(() => useContactModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.method).toBe('email');
  });

  it('open() sin argumento abre en "email"', () => {
    const { result } = renderHook(() => useContactModal());
    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.method).toBe('email');
  });

  it('open("whatsapp") abre con ese método', () => {
    const { result } = renderHook(() => useContactModal());
    act(() => result.current.open('whatsapp'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.method).toBe('whatsapp');
  });

  it('close() cierra pero no resetea el método ya elegido', () => {
    const { result } = renderHook(() => useContactModal());
    act(() => result.current.open('phone'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.method).toBe('phone');
  });
});
