// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

let pathname = '/admin/inventory';
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));

import { PublishStateProvider, usePublishState } from './publish-state-context';
import { fetchProjectPreview, clearPreviewFetchCache } from './preview-fetch';

const wrapper = ({ children }: { children?: ReactNode }) =>
  createElement(
    PublishStateProvider,
    { projectId: 'p1', slug: 'torre', initialPublished: false, projectType: 'edificio', saleMode: 'venta' },
    children
  );

const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });
const goTo = async (path: string, rerender: () => void) => {
  pathname = path;
  rerender();
  await flush();
};

describe('PublishStateProvider: frecuencia del pedido de preview', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers();
    pathname = '/admin/inventory';
    clearPreviewFetchCache();
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('pide el preview al montar', async () => {
    renderHook(() => usePublishState(), { wrapper });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/api/admin/project/preview');
  });

  it('pasar por varias pantallas en pocos segundos no repite el pedido', async () => {
    const { rerender } = renderHook(() => usePublishState(), { wrapper });
    await flush();
    await goTo('/admin/sitio', rerender);
    await goTo('/admin/estilo', rerender);
    await goTo('/admin/settings', rerender);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pasado el intervalo mínimo, navegar vuelve a pedir', async () => {
    const { rerender } = renderHook(() => usePublishState(), { wrapper });
    await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    await goTo('/admin/sitio', rerender);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refresh() fuerza el pedido al instante, sin esperar el intervalo', async () => {
    const { result } = renderHook(() => usePublishState(), { wrapper });
    await flush();
    act(() => result.current.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('volver a la pestaña antes de un minuto no repite el pedido; después sí', async () => {
    renderHook(() => usePublishState(), { wrapper });
    await flush();
    await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(61_000); });
    await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('comparte el pedido con la pantalla que se abre al mismo tiempo (Sitio, Estilo…): un solo fetch', async () => {
    renderHook(() => usePublishState(), { wrapper });
    // la pantalla pide el preview en el mismo momento que el layout
    const screen = fetchProjectPreview('/api/admin/project/preview?projectId=p1');
    await flush();
    await screen;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refresh() no se cuelga de una respuesta reciente: fuerza un pedido nuevo', async () => {
    const { result } = renderHook(() => usePublishState(), { wrapper });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // y ahora hay una respuesta "reciente" guardada
    act(() => result.current.refresh());
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
