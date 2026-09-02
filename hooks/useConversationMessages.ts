'use client';

import { startTransition, useState, useEffect, useCallback, useRef } from 'react';
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
  created_at: string;
}

// Red de contención por si el socket de Realtime se corta sin avisar — el
// disparador normal de refreshLatest() es el evento de postgres_changes de
// abajo, no este intervalo (antes era polling puro cada 4s; ahora es
// push, con esto de respaldo).
const FALLBACK_POLL_INTERVAL_MS = 25000;

export function useConversationMessages(conversationId: string) {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const messagesRef = useRef<ApiMessage[]>([]);

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
        const existingIds = new Set(messagesRef.current.map(m => m.id));
        const fresh = (data.messages ?? []).filter(m => !existingIds.has(m.id)).reverse();
        if (fresh.length > 0) setMessages(prev => [...prev, ...fresh]);
      })
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        () => refreshLatest()
      )
      .subscribe();

    const fallback = setInterval(refreshLatest, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [conversationId, refreshLatest]);

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

  return { messages, loading, loadingMore, hasMore, loadMore, sendMessage };
}
