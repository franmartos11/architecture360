// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Fake mínimo del cliente de Realtime — expone `emit()` para simular el
// evento de postgres_changes que dispararía Supabase cuando llega un
// mensaje nuevo a la conversación.
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

import { useConversationMessages } from './useConversationMessages';
import type { ApiMessage } from './useConversationMessages';

function msg(id: string, created_at: string, body = 'hola'): ApiMessage {
  return {
    id,
    conversation_id: 'conv-1',
    sender_id: 'user-1',
    body,
    shared_post: null,
    attachment_url: null,
    attachment_type: null,
    created_at,
  };
}

function messagesResponse(messages: ApiMessage[], hasMore = false) {
  return { json: () => Promise.resolve({ messages, hasMore }) };
}

describe('useConversationMessages', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('carga inicial: el servidor manda más nuevo primero, el hook lo da vuelta para mostrar más viejo primero', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      messagesResponse(
        [msg('3', '2026-01-01T00:03:00Z'), msg('2', '2026-01-01T00:02:00Z'), msg('1', '2026-01-01T00:01:00Z')],
        true
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.messages.map(m => m.id)).toEqual(['1', '2', '3']);
    expect(result.current.hasMore).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/conversations/conv-1/messages');
  });

  it('cambiar de conversationId resetea los mensajes y carga los de la nueva', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([msg('1', '2026-01-01T00:01:00Z')]))
      .mockResolvedValueOnce(messagesResponse([msg('9', '2026-01-01T00:09:00Z')]));
    vi.stubGlobal('fetch', fetchMock);

    const { result, rerender } = renderHook(({ id }) => useConversationMessages(id), {
      initialProps: { id: 'conv-1' },
    });
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['1']));

    rerender({ id: 'conv-2' });
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['9']));
    expect(fetchMock).toHaveBeenLastCalledWith('/api/conversations/conv-2/messages');
  });

  it('evento de Realtime (mensaje nuevo insertado): agrega solo los que todavía no tenía', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([msg('1', '2026-01-01T00:01:00Z')]))
      .mockResolvedValueOnce(
        messagesResponse([msg('2', '2026-01-01T00:02:00Z'), msg('1', '2026-01-01T00:01:00Z')])
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['1']));

    await act(async () => { realtime.emit(); });
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['1', '2']));
  });

  it('fallback poll: si el socket no avisa nada, igual refresca a intervalo largo', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([msg('1', '2026-01-01T00:01:00Z')]))
      .mockResolvedValueOnce(
        messagesResponse([msg('2', '2026-01-01T00:02:00Z'), msg('1', '2026-01-01T00:01:00Z')])
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers();

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.messages.map(m => m.id)).toEqual(['1']);

    await act(async () => { await vi.advanceTimersByTimeAsync(25000); });
    expect(result.current.messages.map(m => m.id)).toEqual(['1', '2']);
  });

  it('loadMore: pide "before" el mensaje más viejo cargado y lo antepone', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([msg('5', '2026-01-01T00:05:00Z')]))
      .mockResolvedValueOnce(messagesResponse([msg('4', '2026-01-01T00:04:00Z')], true));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['5']));

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.messages.map(m => m.id)).toEqual(['4', '5']));

    expect(fetchMock).toHaveBeenLastCalledWith(
      `/api/conversations/conv-1/messages?before=${encodeURIComponent('2026-01-01T00:05:00Z')}`
    );
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore no hace nada si todavía no hay mensajes cargados', async () => {
    const fetchMock = vi.fn().mockResolvedValue(messagesResponse([]));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = fetchMock.mock.calls.length;
    act(() => result.current.loadMore());
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('sendMessage: en éxito, agrega el mensaje que devuelve el servidor', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([]))
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(msg('nuevo', '2026-01-01T00:10:00Z', 'hola!')) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.sendMessage('hola!'); });

    expect(result.current.messages.map(m => m.id)).toEqual(['nuevo']);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/conversations/conv-1/messages',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sendMessage: si la respuesta no es ok, no agrega nada', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(messagesResponse([]))
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useConversationMessages('conv-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => { await result.current.sendMessage('hola!'); });

    expect(result.current.messages).toEqual([]);
  });
});
