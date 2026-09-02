// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

function fakeRealtimeClient() {
  let handler: ((payload: unknown) => void) | null = null;
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      handler = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    client: { channel: vi.fn(() => channel), removeChannel: vi.fn() },
    emit: () => handler?.({}),
  };
}

const realtime = fakeRealtimeClient();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => realtime.client }));

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

  it('evento de Realtime (mensaje insertado/actualizado): vuelve a pedir el conteo', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(countResponse(1)).mockResolvedValueOnce(countResponse(2));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUnreadMessagesCount(true));

    await waitFor(() => expect(result.current).toBe(1));
    await act(async () => { realtime.emit(); });
    await waitFor(() => expect(result.current).toBe(2));
  });

  it('fallback poll: si el socket no avisa nada, igual vuelve a pedir el conteo a intervalo largo', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadMessagesCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('al desmontar, deja de sondear', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useUnreadMessagesCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
