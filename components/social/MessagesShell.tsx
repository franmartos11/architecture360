'use client';

import { useState, useEffect, useCallback } from 'react';
import ConversationList, { type ConversationRow } from '@/components/social/ConversationList';
import MessageThread from '@/components/social/MessageThread';

const POLL_INTERVAL_MS = 8000;

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
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  const active = conversations?.find(c => c.id === activeConversationId) ?? null;

  return (
    <div className="max-w-5xl mx-auto sm:py-6 px-0 sm:px-4">
      <div className="h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)] flex border border-trevo-dark/10 sm:rounded-2xl overflow-hidden bg-white">
        <div className={`w-full md:w-80 md:shrink-0 md:border-r border-trevo-dark/10 overflow-y-auto ${activeConversationId ? 'hidden md:block' : 'block'}`}>
          <div className="px-5 py-4 border-b border-trevo-dark/10">
            <h1 className="font-bold text-trevo-dark text-lg">Mensajes</h1>
          </div>
          <ConversationList conversations={conversations} activeConversationId={activeConversationId} />
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
