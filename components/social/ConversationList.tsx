'use client';

import { MessageSquare } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import EmptyState from '@/components/ui/EmptyState';
import { formatRelativeTime } from '@/lib/relativeTime';
import { useIsOnline } from '@/lib/presence-context';

export interface ConversationRow {
  id: string;
  other: { id: string; handle: string; display_name: string; avatar_image: string | null } | null;
  lastMessage: { body: string | null; sender_id: string; created_at: string } | null;
  unreadCount: number;
  lastMessageAt: string;
}

interface ConversationListProps {
  conversations: ConversationRow[] | null;
  activeConversationId?: string;
}

// Puramente presentacional — el fetch/polling vive en MessagesShell, que
// también lo necesita para resolver el header del hilo activo, así que
// evita duplicar la misma llamada acá.
export default function ConversationList({ conversations, activeConversationId }: ConversationListProps) {
  if (conversations === null) return null;

  if (conversations.length === 0) {
    return (
      <div className="p-5">
        <EmptyState
          icon={<MessageSquare className="w-6 h-6" />}
          title="Todavía no tenés conversaciones."
          description="Mandale un mensaje a alguien desde su perfil para arrancar una."
        />
      </div>
    );
  }

  return (
    <ul className="divide-y divide-trevo-dark/5">
      {conversations.map(c => (
        <ConversationListItem key={c.id} conversation={c} isActive={c.id === activeConversationId} />
      ))}
    </ul>
  );
}

function ConversationListItem({ conversation: c, isActive }: { conversation: ConversationRow; isActive: boolean }) {
  const online = useIsOnline(c.other?.id);

  return (
    <li>
      <Link
        href={`/mensajes/${c.id}`}
        className={`flex items-center gap-3 px-4 py-3 hover:bg-trevo-dark/5 transition-colors ${isActive ? 'bg-trevo-dark/5' : ''}`}
      >
        <div className="relative w-11 h-11 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
          {c.other?.avatar_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.other.avatar_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-trevo-dark/40 font-medium">{(c.other?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
          )}
          {online && <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-white" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm truncate ${c.unreadCount > 0 ? 'font-semibold text-trevo-dark' : 'font-medium text-trevo-dark/80'}`}>
              {c.other?.display_name ?? 'Usuario'}
            </p>
            <span className="text-xs text-trevo-dark/30 shrink-0">{formatRelativeTime(c.lastMessageAt)}</span>
          </div>
          <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-trevo-dark/70 font-medium' : 'text-trevo-dark/40'}`}>
            {c.lastMessage?.body ?? 'Sin mensajes todavía'}
          </p>
        </div>
        {c.unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" aria-label={`${c.unreadCount} sin leer`} />}
      </Link>
    </li>
  );
}
