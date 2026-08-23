'use client';

import { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { useToast } from '@/components/ui/ToastProvider';

interface SearchResult {
  handle: string;
  display_name: string;
  avatar_image: string | null;
}

// Picker liviano para "Enviar" un post por mensaje — reusa el mismo
// GET /api/profiles/search que ya usa NavSearch. Al elegir a alguien,
// obtiene/crea la conversación y manda el post como shared_post_id.
export default function SendPostModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const toast = useToast();

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    const timer = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => setResults(data.profiles ?? []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSend = async (handle: string) => {
    setSendingTo(handle);
    const convRes = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle }),
    });
    if (!convRes.ok) {
      setSendingTo(null);
      const data = await convRes.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo enviar.', 'error');
      return;
    }
    const { id: conversationId } = await convRes.json();
    const msgRes = await fetch(`/api/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sharedPostId: postId }),
    });
    setSendingTo(null);
    if (msgRes.ok) {
      toast('Post enviado.');
      onClose();
    } else {
      const data = await msgRes.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo enviar.', 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={onClose}>
      <div className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-trevo-dark/10 shrink-0">
          <h2 className="font-semibold text-trevo-dark">Enviar por mensaje</h2>
          <button onClick={onClose} className="p-1 text-trevo-dark/40 hover:text-trevo-dark transition-colors" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 shrink-0">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar personas..."
            aria-label="Buscar personas"
            className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-sm text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all"
          />
        </div>
        <div className="overflow-y-auto flex-1">
          {results.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-trevo-dark/40 text-center">
              {query.trim() ? 'Sin resultados' : 'Buscá a alguien para mandarle este post'}
            </p>
          ) : (
            <ul className="divide-y divide-trevo-dark/5">
              {results.map(r => (
                <li key={r.handle}>
                  <button
                    onClick={() => handleSend(r.handle)}
                    disabled={sendingTo !== null}
                    className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-trevo-dark/5 transition-colors text-left disabled:opacity-50"
                  >
                    <div className="relative w-8 h-8 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                      {r.avatar_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.avatar_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-xs text-trevo-dark/40 font-medium">{r.display_name.charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span className="flex-1 min-w-0 text-sm font-medium text-trevo-dark truncate">{r.display_name}</span>
                    {sendingTo === r.handle ? (
                      <span className="text-xs text-trevo-dark/40 shrink-0">Enviando...</span>
                    ) : (
                      <Send className="w-4 h-4 text-trevo-dark/30 shrink-0" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
