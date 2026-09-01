// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useNewLeadsCount } from './useNewLeadsCount';

const STORAGE_KEY = 'leads-last-seen-at';

function leadsResponse(createdAts: string[], ok = true) {
  return { ok, json: () => Promise.resolve(createdAts.map(created_at => ({ created_at }))) };
}

describe('useNewLeadsCount', () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('sin lastSeenAt guardado: todos los leads cuentan como nuevos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(leadsResponse(['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'])));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(2));
  });

  it('con lastSeenAt guardado: solo cuentan los leads posteriores', async () => {
    localStorage.setItem(STORAGE_KEY, String(new Date('2026-01-01T12:00:00Z').getTime()));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(leadsResponse(['2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z'])));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(1));
  });

  it('respuesta no-ok: no rompe, count se queda en 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(leadsResponse([], false)));
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
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(leadsResponse(['2026-01-01T00:00:00Z'])));
    const { result } = renderHook(() => useNewLeadsCount());
    await waitFor(() => expect(result.current.count).toBe(1));

    act(() => result.current.markSeen());

    expect(result.current.count).toBe(0);
    expect(Number(localStorage.getItem(STORAGE_KEY))).toBeGreaterThan(Date.now() - 5000);
  });

  it('vuelve a chequear cada 30s', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(leadsResponse([]));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useNewLeadsCount());

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
