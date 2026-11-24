// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { useCalculatorSettings, invalidateCalculatorSettings } from './useCalculatorSettings';

afterEach(() => cleanup());
// La caché es por proyecto y vive en el módulo: cada test usa un slug propio.

describe('useCalculatorSettings', () => {
  it('null mientras carga; después la config con planes', async () => {
    const body = { interestRate: 6, maxYears: 20, minDownPayment: 10, financingPlans: [] };
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(body) }) as never;
    const { result } = renderHook(() => useCalculatorSettings('torre-a'));
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toEqual(body));
  });

  it('dos calculadoras del mismo proyecto hacen un solo pedido', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ interestRate: 6, maxYears: 20, minDownPayment: 10, financingPlans: [] }) }) as never;
    const a = renderHook(() => useCalculatorSettings('torre-b'));
    const b = renderHook(() => useCalculatorSettings('torre-b'));
    await waitFor(() => expect(a.result.current).not.toBeNull());
    await waitFor(() => expect(b.result.current).not.toBeNull());
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('si falla el pedido: valores por defecto sin planes (sigue el hipotecario)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as never;
    const { result } = renderHook(() => useCalculatorSettings('torre-c'));
    await waitFor(() => expect(result.current).toEqual({ interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [] }));
  });

  it('respuesta sin financingPlans (base sin la columna): lista vacía', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ interestRate: 6, maxYears: 20, minDownPayment: 10 }) }) as never;
    const { result } = renderHook(() => useCalculatorSettings('torre-d'));
    await waitFor(() => expect(result.current?.financingPlans).toEqual([]));
  });
});

describe('useCalculatorSettings — revisión', () => {
  it('respuesta no OK: valores por defecto y el próximo montaje vuelve a pedir', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }) as never;
    const a = renderHook(() => useCalculatorSettings('torre-e'));
    await waitFor(() => expect(a.result.current?.financingPlans).toEqual([]));
    renderHook(() => useCalculatorSettings('torre-e'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('invalidateCalculatorSettings: después de guardar en el panel se vuelve a pedir', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ interestRate: 6, maxYears: 20, minDownPayment: 10, financingPlans: [] }) }) as never;
    const a = renderHook(() => useCalculatorSettings('torre-f'));
    await waitFor(() => expect(a.result.current).not.toBeNull());
    invalidateCalculatorSettings();
    renderHook(() => useCalculatorSettings('torre-f'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });

  it('ya resuelto: el siguiente montaje arranca con el valor, sin un render vacío', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ interestRate: 6, maxYears: 20, minDownPayment: 10, financingPlans: [] }) }) as never;
    const a = renderHook(() => useCalculatorSettings('torre-g'));
    await waitFor(() => expect(a.result.current).not.toBeNull());
    const b = renderHook(() => useCalculatorSettings('torre-g'));
    expect(b.result.current).not.toBeNull();
  });
});
