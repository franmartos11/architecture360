'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/ToastProvider';
import { CommentSkeleton } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/relativeTime';
import ProfileHoverCard from '@/components/social/ProfileHoverCard';
import KebabMenu from '@/components/ui/KebabMenu';
import EmojiPicker from '@/components/ui/EmojiPicker';

interface Comment {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null } | null;
}

interface CommentSectionProps {
  /** 'project' usa /api/comments (project_comments); 'post' usa /api/post-comments (post_comments) — misma UX, tablas distintas. */
  entityType: 'project' | 'post';
  entityId: string;
}

export default function CommentSection({ entityType, entityId }: CommentSectionProps) {
  const apiBase = entityType === 'project' ? '/api/comments' : '/api/post-comments';
  const idParam = entityType === 'project' ? 'projectId' : 'postId';

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const toast = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Inserta en la posición del cursor (no siempre al final) y le devuelve
  // el foco al textarea — si no, después de elegir un emoji el cursor
  // "desaparece" y hay que volver a clickear el textarea para seguir
  // escribiendo.
  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) { setText(prev => prev + emoji); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    });
  };

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    startTransition(() => { setLoading(true); });
    fetch(`${apiBase}?${idParam}=${entityId}`)
      .then(res => res.json())
      .then(data => {
        setComments(data.comments ?? []);
        setHasMore(!!data.hasMore);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId]);

  const loadMore = () => {
    const oldest = comments[comments.length - 1];
    if (!oldest) return;
    setLoadingMore(true);
    fetch(`${apiBase}?${idParam}=${entityId}&before=${encodeURIComponent(oldest.created_at)}`)
      .then(res => res.json())
      .then(data => {
        setComments(prev => [...prev, ...(data.comments ?? [])]);
        setHasMore(!!data.hasMore);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch(apiBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [idParam]: entityId, body: text }),
    });
    setPosting(false);
    if (res.ok) {
      const created: Comment = await res.json();
      setComments(prev => [created, ...prev]);
      setText('');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo publicar el comentario.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Borrar este comentario?')) return;
    const res = await fetch(`${apiBase}/${id}`, { method: 'DELETE' });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== id));
    else toast('No se pudo borrar.', 'error');
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {userId ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Dejá un comentario..."
              className="w-full px-4 py-3 pr-11 rounded-[var(--theme-radius)] border border-[var(--theme-border)] bg-[var(--theme-surface)] text-[var(--theme-text)] placeholder:text-[var(--theme-text-muted)] focus:ring-2 focus:ring-[var(--theme-accent)]/20 focus:border-[var(--theme-accent)] outline-none transition-all resize-none"
            />
            <div className="absolute right-2 bottom-2">
              <EmojiPicker onSelect={insertEmoji} />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={posting || !text.trim()}
              className="px-6 py-3 bg-[var(--theme-accent)] text-[var(--theme-text-on-dark)] hover:opacity-85 transition-opacity duration-300 tracking-wider text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? 'Publicando...' : 'Comentar'}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-center text-[var(--theme-text-muted)] font-light py-6 border border-dashed border-[var(--theme-border)] rounded-[var(--theme-radius)]">
          <a href="/admin/login" className="text-[var(--theme-text)] underline hover:no-underline">Iniciá sesión</a> para comentar.
        </p>
      )}

      {loading && (
        <div className="space-y-6">
          <CommentSkeleton />
          <CommentSkeleton />
        </div>
      )}

      {!loading && comments.length > 0 && (
        <div className="space-y-6">
          {comments.map(c => (
            <div key={c.id} className="flex gap-3">
              <div className="relative w-9 h-9 rounded-full overflow-hidden shrink-0 bg-[var(--theme-border)] flex items-center justify-center">
                {c.author?.avatar_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.author.avatar_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm text-[var(--theme-text-muted)] font-medium">
                    {(c.author?.display_name ?? 'U').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-[var(--theme-text)]">
                    {c.author ? (
                      <ProfileHoverCard handle={c.author.handle} loggedIn={!!userId} isOwnProfile={c.author_id === userId}>
                        <a href={`/portfolio/${c.author.handle}`} className="hover:underline">{c.author.display_name}</a>
                      </ProfileHoverCard>
                    ) : 'Usuario'}
                  </p>
                  <span className="text-xs text-[var(--theme-text-muted)]">
                    {formatRelativeTime(c.created_at)}
                  </span>
                </div>
                <p className="text-[var(--theme-text-muted)] font-light mt-0.5 whitespace-pre-line">{c.body}</p>
              </div>
              {c.author_id === userId && (
                <KebabMenu items={[{ label: 'Borrar', onClick: () => handleDelete(c.id), danger: true }]} />
              )}
            </div>
          ))}
          {hasMore && (
            <div className="text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm font-medium text-[var(--theme-text-muted)] hover:text-[var(--theme-text)] transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Cargando...' : 'Cargar más comentarios'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
