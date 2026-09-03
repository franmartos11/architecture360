'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare, Search, Pin, X } from 'lucide-react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/ToastProvider';
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

const PIN_STORAGE_KEY = 'pinned-conversations';
type Tab = 'all' | 'unread' | 'pinned';

function loadPinnedIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

// Buscador + tabs + fijados + "Nuevo mensaje" son todos client-side sobre la
// lista que ya trae MessagesShell entero (fetch/polling/realtime siguen
// viviendo ahí, esto sigue siendo mayormente presentacional). "Fijados" no
// existe en la base — es una preferencia local del navegador (localStorage),
// no sincroniza entre dispositivos pero persiste entre visitas en este.
export default function ConversationList({ conversations, activeConversationId }: ConversationListProps) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => { startTransition(() => setPinnedIds(loadPinnedIds())); }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  if (conversations === null) return null;

  const query = q.trim().toLowerCase();
  const filtered = conversations.filter(c => {
    if (query) {
      const haystack = `${c.other?.display_name ?? ''} ${c.other?.handle ?? ''} ${c.lastMessage?.body ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (tab === 'unread' && c.unreadCount === 0) return false;
    if (tab === 'pinned' && !pinnedIds.has(c.id)) return false;
    return true;
  });
  const totalUnread = conversations.reduce((a, c) => a + c.unreadCount, 0);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2.5 flex flex-col gap-2.5 border-b border-trevo-dark/8">
        <div className="flex items-center gap-2">
          {totalUnread > 0 && (
            <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-brand-600 text-white text-[11px] font-semibold flex items-center justify-center">
              {totalUnread}
            </span>
          )}
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg bg-trevo-dark text-white text-xs font-medium hover:bg-trevo-dark/90 transition-colors"
          >
            + Nuevo
          </button>
        </div>
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-trevo-dark/12 bg-white">
          <Search className="w-3.5 h-3.5 text-trevo-dark/35 shrink-0" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar en tus conversaciones"
            aria-label="Buscar en tus conversaciones"
            className="flex-1 min-w-0 text-sm text-trevo-dark placeholder:text-trevo-dark/35 outline-none"
          />
        </div>
        <div className="flex gap-1.5">
          {([['all', 'Todos'], ['unread', 'No leídos'], ['pinned', 'Fijados']] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`h-7 px-3 rounded-full text-xs font-medium border transition-colors ${
                tab === key ? 'bg-trevo-dark border-trevo-dark text-white' : 'bg-white border-trevo-dark/12 text-trevo-dark/60 hover:border-trevo-dark/25'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        conversations.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<MessageSquare className="w-6 h-6" />}
              title="Todavía no tenés conversaciones."
              description="Mandale un mensaje a alguien desde su perfil o con el botón “Nuevo”, acá arriba."
            />
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-xs text-trevo-dark/40">
            {query ? <>Sin resultados para &ldquo;{q}&rdquo;.</> : 'Nada acá por ahora.'}
          </p>
        )
      ) : (
        <ul className="flex-1 overflow-y-auto divide-y divide-trevo-dark/5">
          {filtered.map(c => (
            <ConversationListItem
              key={c.id}
              conversation={c}
              isActive={c.id === activeConversationId}
              pinned={pinnedIds.has(c.id)}
              onTogglePin={() => togglePin(c.id)}
            />
          ))}
        </ul>
      )}

      {newOpen && <NewMessageDialog onClose={() => setNewOpen(false)} />}
    </div>
  );
}

function ConversationListItem({
  conversation: c, isActive, pinned, onTogglePin,
}: {
  conversation: ConversationRow; isActive: boolean; pinned: boolean; onTogglePin: () => void;
}) {
  const online = useIsOnline(c.other?.id);

  return (
    <li className="group relative">
      <Link
        href={`/mensajes/${c.id}`}
        className={`flex items-center gap-3 pl-4 pr-9 py-3 hover:bg-trevo-dark/5 transition-colors ${isActive ? 'bg-trevo-dark/5' : ''}`}
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
            <p className={`text-sm truncate flex items-center gap-1.5 ${c.unreadCount > 0 ? 'font-semibold text-trevo-dark' : 'font-medium text-trevo-dark/80'}`}>
              {pinned && <Pin className="w-3 h-3 text-trevo-dark/30 shrink-0 fill-current" />}
              <span className="truncate">{c.other?.display_name ?? 'Usuario'}</span>
            </p>
            <span className="text-xs text-trevo-dark/30 shrink-0">{formatRelativeTime(c.lastMessageAt)}</span>
          </div>
          <p className={`text-xs truncate ${c.unreadCount > 0 ? 'text-trevo-dark/70 font-medium' : 'text-trevo-dark/40'}`}>
            {c.lastMessage?.body ?? 'Sin mensajes todavía'}
          </p>
        </div>
        {c.unreadCount > 0 && <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" aria-label={`${c.unreadCount} sin leer`} />}
      </Link>
      <button
        type="button"
        onClick={e => { e.preventDefault(); onTogglePin(); }}
        aria-label={pinned ? 'Desfijar conversación' : 'Fijar conversación'}
        title={pinned ? 'Desfijar' : 'Fijar'}
        className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-opacity ${
          pinned ? 'opacity-100 text-trevo-dark/50' : 'opacity-0 group-hover:opacity-100 text-trevo-dark/30 hover:text-trevo-dark/60'
        }`}
      >
        <Pin className={`w-3.5 h-3.5 ${pinned ? 'fill-current' : ''}`} />
      </button>
    </li>
  );
}

interface SearchProfile { handle: string; display_name: string; avatar_image: string | null; account_type: string }

// Modal chico para arrancar una conversación nueva sin pasar por el perfil
// de la otra persona — busca en /api/profiles/search (mismo endpoint del
// buscador de la nav) y crea/reusa la conversación con el mismo POST
// /api/conversations que ya usa MessageButton.tsx desde un perfil.
function NewMessageDialog({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const query = q.trim();
    if (!query) {
      startTransition(() => setResults([]));
      return;
    }
    startTransition(() => setSearching(true));
    const t = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => setResults(data.profiles ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const start = async (handle: string) => {
    setStarting(handle);
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    setStarting(null);
    if (res.ok) {
      const data = await res.json();
      onClose();
      router.push(`/mensajes/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo iniciar la conversación.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center pt-24 z-[300] p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-trevo-dark/10">
          <h3 className="text-sm font-semibold text-trevo-dark flex-1">Nuevo mensaje</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="p-1 text-trevo-dark/40 hover:text-trevo-dark transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3">
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre o @usuario"
            className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-sm text-trevo-dark placeholder:text-trevo-dark/35 outline-none focus:ring-2 focus:ring-trevo-dark/20"
          />
        </div>
        <div className="max-h-72 overflow-y-auto pb-2">
          {searching && <p className="px-4 py-3 text-xs text-trevo-dark/40">Buscando...</p>}
          {!searching && q.trim() && results.length === 0 && (
            <p className="px-4 py-3 text-xs text-trevo-dark/40">Sin resultados para &ldquo;{q}&rdquo;.</p>
          )}
          {results.map(p => (
            <button
              key={p.handle}
              type="button"
              onClick={() => start(p.handle)}
              disabled={starting !== null}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-trevo-dark/5 transition-colors text-left disabled:opacity-50"
            >
              <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                {p.avatar_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.avatar_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-xs text-trevo-dark/40 font-medium">{p.display_name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-trevo-dark truncate">{p.display_name}</p>
                <p className="text-xs text-trevo-dark/40 truncate">@{p.handle}</p>
              </div>
              {starting === p.handle && <span className="text-xs text-trevo-dark/40 shrink-0">Abriendo...</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
