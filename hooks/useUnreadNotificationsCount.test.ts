// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUnreadNotificationsCount } from './useUnreadNotificationsCount';

function countResponse(count: number) {
  return { json: () => Promise.resolve({ count }) };
}

describe('useUnreadNotificationsCount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('enabled=false: nunca pide el conteo', () => {
    const fetchMock = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadNotificationsCount(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enabled=true: pide el conteo al montar y lo expone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(countResponse(5)));
    const { result } = renderHook(() => useUnreadNotificationsCount(true));
    await waitFor(() => expect(result.current.count).toBe(5));
    expect(fetch).toHaveBeenCalledWith('/api/notifications/unread-count');
  });

  it('un fetch fallido no rompe — el conteo se queda en 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { result } = renderHook(() => useUnreadNotificationsCount(true));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current.count).toBe(0);
  });

  it('clear() resetea el conteo local a 0 sin pedir nada al servidor', async () => {
    const fetchMock = vi.fn().mockResolvedValue(countResponse(5));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUnreadNotificationsCount(true));
    await waitFor(() => expect(result.current.count).toBe(5));

    const callsBefore = fetchMock.mock.calls.length;
    act(() => result.current.clear());

    expect(result.current.count).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('vuelve a pedir el conteo cada 30s mientras está habilitado', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadNotificationsCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('al desmontar, deja de sondear', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useUnreadNotificationsCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
