// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

function fakeRealtimeClient(userId: string | null = 'user-1') {
  let handler: ((payload: unknown) => void) | null = null;
  const channel = {
    on: vi.fn((_event: string, _filter: unknown, cb: (payload: unknown) => void) => {
      handler = cb;
      return channel;
    }),
    subscribe: vi.fn(() => channel),
  };
  return {
    client: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: userId ? { id: userId } : null } }) },
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
    emit: () => handler?.({}),
  };
}

const realtime = fakeRealtimeClient();
vi.mock('@/lib/supabase/client', () => ({ createClient: () => realtime.client }));

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

  it('evento de Realtime (notificación nueva): vuelve a pedir el conteo', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(countResponse(1)).mockResolvedValueOnce(countResponse(4));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useUnreadNotificationsCount(true));

    await waitFor(() => expect(result.current.count).toBe(1));
    await act(async () => { realtime.emit(); });
    await waitFor(() => expect(result.current.count).toBe(4));
  });

  it('fallback poll: si el socket no avisa nada, igual vuelve a pedir el conteo a intervalo largo', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    renderHook(() => useUnreadNotificationsCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('al desmontar, deja de sondear', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(countResponse(1));
    vi.stubGlobal('fetch', fetchMock);
    const { unmount } = renderHook(() => useUnreadNotificationsCount(true));

    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(120000); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
