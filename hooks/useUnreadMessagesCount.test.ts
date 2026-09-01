// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useUnreadMessagesCount } from './useUnreadMessagesCount';

function countResponse(count: number) {
  return { json: () => Promise.resolve({ count }) };
}

describe('useUnreadMessagesCount', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('enabled=false: nunca pide el conteo', () => {
    const fetchMock = vi.fn().mockResolvedValue(countResponse(0));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadMessagesCount(false));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('enabled=true: pide el conteo al montar y lo expone', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(countResponse(3)));
    const { result } = renderHook(() => useUnreadMessagesCount(true));
    await waitFor(() => expect(result.current).toBe(3));
    expect(fetch).toHaveBeenCalledWith('/api/conversations/unread-count');
  });

  it('un fetch fallido no rompe — el conteo se queda en 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { result } = renderHook(() => useUnreadMessagesCount(true));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(result.current).toBe(0);
  });

  it('vuelve a pedir el conteo cada 30s mientras está habilitado', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadMessagesCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('al desmontar, deja de sondear', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useUnreadMessagesCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
