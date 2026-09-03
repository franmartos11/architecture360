'use client';

import { startTransition, useState, useEffect, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { EmbeddedPost } from '@/components/social/EmbeddedPostCard';

export interface ApiMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  shared_post: EmbeddedPost | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'audio' | 'file' | null;
  // Ya viene en la respuesta (el select del server es '*, shared_post:...')
  // — antes el tipo simplemente no lo declaraba. Sirve para "Enviado"/"Visto".
  read_at: string | null;
  created_at: string;
}

// Red de contención por si el socket de Realtime se corta sin avisar — el
// disparador normal de refreshLatest() es el evento de postgres_changes de
// abajo, no este intervalo (antes era polling puro cada 4s; ahora es
// push, con esto de respaldo).
const FALLBACK_POLL_INTERVAL_MS = 25000;

// Cuánto dura "escribiendo…" del otro lado sin recibir un nuevo broadcast
// antes de apagarse solo — cubre el caso de que se vaya de la pantalla o
// pierda conexión sin mandar el evento de "dejé de escribir".
const TYPING_TIMEOUT_MS = 3000;
// No se manda un broadcast por cada tecla — alcanza con avisar una vez
// cada tanto mientras se sigue tipeando.
const TYPING_THROTTLE_MS = 2000;

export function useConversationMessages(conversationId: string) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const messagesRef = useRef<ApiMessage[]>([]);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    startTransition(() => {
      setLoading(true);
      setMessages([]);
    });
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(res => res.json())
      .then((data: { messages: ApiMessage[]; hasMore: boolean }) => {
        setMessages((data.messages ?? []).slice().reverse());
        setHasMore(!!data.hasMore);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [conversationId]);

  // Trae la última página y agrega solo los ids que todavía no tenía — no
  // hay un endpoint "dame lo nuevo desde X", así que sigue siendo una sola
  // query barata cada vez que se llama, ya sea desde el evento de Realtime
  // de abajo o desde el fallback poll.
  const refreshLatest = useCallback(() => {
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(res => res.json())
      .then((data: { messages: ApiMessage[] }) => {
        const page = (data.messages ?? []).slice().reverse();
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          // Actualiza in-place los que ya tenía (ej. read_at cuando el otro
          // participante lee el hilo — sin esto "Visto" quedaba pisado por
          // el filtro de "solo agregar ids nuevos") y agrega los genuinamente
          // nuevos al final.
          const byId = new Map(page.map(m => [m.id, m]));
          const merged = prev.map(m => byId.get(m.id) ?? m);
          const fresh = page.filter(m => !existingIds.has(m.id));
          return fresh.length > 0 ? [...merged, ...fresh] : merged;
        });
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    // { self: false } — sin esto, "escribiendo…" propio rebotaría de
    // vuelta apenas se manda. Un broadcast (no postgres_changes): efímero,
    // no se persiste ni queda rastro en la conversación.
    const channel = supabase
      .channel(`messages:${conversationId}`, { config: { broadcast: { self: false } } })
      .on(
        // INSERT (mensaje nuevo) y UPDATE (read_at cuando el otro participante
        // lo lee — necesario para que "Visto" se actualice sin recargar).
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => refreshLatest()
      )
      .on('broadcast', { event: 'typing' }, () => {
        setOtherTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), TYPING_TIMEOUT_MS);
      })
      .subscribe();
    channelRef.current = channel;

    const fallback = setInterval(refreshLatest, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      clearInterval(fallback);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setOtherTyping(false);
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [conversationId, refreshLatest]);

  // Throttleado — no vale la pena mandar un broadcast por cada tecla.
  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = now;
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: {} });
  }, []);

  const loadMore = useCallback(() => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingMore) return;
    setLoadingMore(true);
    fetch(`/api/conversations/${conversationId}/messages?before=${encodeURIComponent(oldest.created_at)}`)
      .then(res => res.json())
      .then((data: { messages: ApiMessage[]; hasMore: boolean }) => {
        setMessages(prev => [...(data.messages ?? []).slice().reverse(), ...prev]);
        setHasMore(!!data.hasMore);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  }, [conversationId, loadingMore]);

  const sendMessage = useCallback(async (
    body: string,
    attachment?: { path: string; type: 'image' | 'audio' | 'file' }
  ) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, attachmentPath: attachment?.path, attachmentType: attachment?.type }),
    });
    if (res.ok) {
      const created: ApiMessage = await res.json();
      setMessages(prev => (prev.some(m => m.id === created.id) ? prev : [...prev, created]));
    }
    return res;
  }, [conversationId]);

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage, otherTyping, notifyTyping };
}
