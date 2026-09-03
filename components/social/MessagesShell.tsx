'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import ConversationList, { type ConversationRow } from '@/components/social/ConversationList';
import MessageThread from '@/components/social/MessageThread';

// Red de contención por si el socket de Realtime se corta sin avisar — el
// disparador normal de load() es el evento de postgres_changes de abajo
// (antes era polling puro cada 8s, sin importar si había algo nuevo o no).
const FALLBACK_POLL_INTERVAL_MS = 30000;

// Layout de dos paneles en desktop (lista + hilo abierto), un panel a la
// vez en mobile — patrón nuevo en el proyecto, no hay nada parecido hoy.
// En mobile se decide qué panel mostrar según si hay conversación activa:
// sin ella se ve la lista completa; con ella, el hilo ocupa toda la
// pantalla y el botón "← Mensajes" de MessageThread vuelve a la lista.
export default function MessagesShell({ activeConversationId }: { activeConversationId?: string }) {
  const [conversations, setConversations] = useState<ConversationRow[] | null>(null);

  const load = useCallback(() => {
    fetch('/api/conversations')
      .then(res => res.json())
      .then(data => setConversations(data.conversations ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();

    // Sin filtro de columna a propósito: postgres_changes ya viene
    // acotado por RLS al conjunto de conversaciones donde participo, así
    // que cualquier INSERT/UPDATE de messages que efectivamente me llega
    // es relevante para esta lista (mensaje nuevo, o marcado como leído
    // desde otra pestaña).
    const supabase = createClient();
    const channel = supabase
      .channel('conversations:mine')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => load())
      .subscribe();

    const fallback = setInterval(load, FALLBACK_POLL_INTERVAL_MS);
    return () => {
      clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const active = conversations?.find(c => c.id === activeConversationId) ?? null;

  return (
    <div className="max-w-5xl mx-auto sm:py-6 px-0 sm:px-4">
      <div className="h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)] flex border border-trevo-dark/10 sm:rounded-2xl overflow-hidden bg-white">
        <div className={`w-full md:w-[336px] md:shrink-0 md:border-r border-trevo-dark/10 flex flex-col min-h-0 ${activeConversationId ? 'hidden md:flex' : 'flex'}`}>
          <div className="px-5 pt-4 pb-1 shrink-0">
            <h1 className="font-bold text-trevo-dark text-lg">Mensajes</h1>
          </div>
          <div className="flex-1 min-h-0">
            <ConversationList conversations={conversations} activeConversationId={activeConversationId} />
          </div>
        </div>

        <div className={`flex-1 min-w-0 ${activeConversationId ? 'flex' : 'hidden md:flex'} flex-col`}>
          {activeConversationId ? (
            <MessageThread key={activeConversationId} conversationId={activeConversationId} other={active?.other ?? null} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-trevo-dark/30 text-sm px-6 text-center">
              Elegí una conversación para empezar, o escribile a alguien desde su perfil.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
