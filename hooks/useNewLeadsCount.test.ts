// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useNewLeadsCount } from './useNewLeadsCount';

const STORAGE_KEY = 'leads-last-seen-at';

// El servidor cuenta (GET /api/admin/leads?count=1&since=…): el hook ya no baja la lista.
function countResponse(count: number, ok = true) {
  return { ok, json: () => Promise.resolve({ count }) };
}

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
}

describe('useNewLeadsCount', () => {
  afterEach(() => {
    cleanup(); // sin globals de vitest no se desmonta solo: los hooks viejos seguirían escuchando
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    setHidden(false);
  });

  it('muestra el conteo que informa el servidor', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(countResponse(2)));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it('sin lastSeenAt guardado pide desde 0', async () => {
    const fetchMock = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('count=1&since=0');
  });

  it('con lastSeenAt guardado se lo manda al servidor como since', async () => {
    const seen = new Date('2026-01-01T12:00:00Z').getTime();
    localStorage.setItem(STORAGE_KEY, String(seen));
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(1));
    expect(fetchMock.mock.calls[0][0]).toContain(`since=${seen}`);
  });

  it('respuesta no-ok: no rompe, count se queda en 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(countResponse(5, false)));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('fetch que tira: no rompe (silencioso)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('markSeen(): resetea el conteo a 0 y guarda el momento actual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(countResponse(1)));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(1));

    act(() => result.current.markSeen());

    expect(result.current.count).toBe(0);
    expect(Number(localStorage.getItem(STORAGE_KEY))).toBeGreaterThan(Date.now() - 5000);
  });

  it('vuelve a chequear cada 30s', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNewLeadsCount());

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('con la pestaña oculta no consulta, y al volver se pone al día', async () => {
    vi.useFakeTimers();
    setHidden(true);
    const fetchMock = vi.fn().mockResolvedValue(countResponse(3));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNewLeadsCount());

    await act(async () => { await vi.advanceTimersByTimeAsync(90000); });
    expect(fetchMock).not.toHaveBeenCalled();

    setHidden(false);
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
