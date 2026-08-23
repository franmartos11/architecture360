'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { EmbeddedPost } from '@/components/social/EmbeddedPostCard';

export interface ApiMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  shared_post: EmbeddedPost | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'audio' | 'file' | null;
  created_at: string;
}

const POLL_INTERVAL_MS = 4000;

// Polling simple mientras el hilo está montado — mismo criterio de
// infraestructura que el resto de la app (sin websockets). No hay un
// endpoint "dame lo nuevo desde X": cada poll vuelve a pedir la última
// página y solo agrega los ids que todavía no tenía, así que sigue siendo
// una sola query barata por tick.
export function useConversationMessages(conversationId: string) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const messagesRef = useRef<ApiMessage[]>([]);
  messagesRef.current = messages;

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    fetch(`/api/conversations/${conversationId}/messages`)
      .then(res => res.json())
      .then((data: { messages: ApiMessage[]; hasMore: boolean }) => {
        setMessages((data.messages ?? []).slice().reverse());
        setHasMore(!!data.hasMore);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [conversationId]);

  useEffect(() => {
    const poll = () => {
      fetch(`/api/conversations/${conversationId}/messages`)
        .then(res => res.json())
        .then((data: { messages: ApiMessage[] }) => {
          const existingIds = new Set(messagesRef.current.map(m => m.id));
          const fresh = (data.messages ?? []).filter(m => !existingIds.has(m.id)).reverse();
          if (fresh.length > 0) setMessages(prev => [...prev, ...fresh]);
        })
        .catch(() => {});
    };
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [conversationId]);

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
    attachment?: { url: string; type: 'image' | 'audio' | 'file' }
  ) => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body, attachmentUrl: attachment?.url, attachmentType: attachment?.type }),
    });
    if (res.ok) {
      const created: ApiMessage = await res.json();
      setMessages(prev => (prev.some(m => m.id === created.id) ? prev : [...prev, created]));
    }
    return res;
  }, [conversationId]);

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage };
}
