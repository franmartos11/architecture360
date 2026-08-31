'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Rss, Repeat2, Send, Share2, X } from 'lucide-react';
import ShareMenu from '@/components/ui/ShareMenu';
import ImageUploader from '@/components/admin/ImageUploader';
import EmptyState from '@/components/ui/EmptyState';
import CommentSection from '@/components/CommentSection';
import { useToast } from '@/components/ui/ToastProvider';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PeopleSuggestions from '@/components/social/PeopleSuggestions';
import ProfileHoverCard from '@/components/social/ProfileHoverCard';
import EmbeddedPostCard, { type EmbeddedPost } from '@/components/social/EmbeddedPostCard';
import SendPostModal from '@/components/social/SendPostModal';
import MentionTextarea from '@/components/social/MentionTextarea';
import MentionText from '@/components/social/MentionText';
import KebabMenu from '@/components/ui/KebabMenu';
import { PostSkeleton } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/relativeTime';

interface ApiPost {
  id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null } | null;
  shared_post: EmbeddedPost | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
}

interface PostFeedProps {
  /** Sin esto, es el feed global (todos los posts). Con esto, solo los de ese perfil. */
  authorHandle?: string;
  loggedIn: boolean;
  /** El handle propio de quien está mirando, si tiene perfil — determina si puede publicar/borrar acá. */
  currentProfileHandle: string | null;
  /** Avatar propio, para mostrarlo junto al composer — undefined si no tiene. */
  currentAvatarImage?: string | null;
  /** 'following' = solo posts de gente seguida. Ignorado si se pasa authorHandle. */
  scope?: 'following' | 'global';
}

export default function PostFeed({ authorHandle, loggedIn, currentProfileHandle, currentAvatarImage, scope }: PostFeedProps) {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [repostingPost, setRepostingPost] = useState<ApiPost | null>(null);
  const [repostText, setRepostText] = useState('');
  const [reposting, setReposting] = useState(false);
  const [sendingPostId, setSendingPostId] = useState<string | null>(null);
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const buildQuery = (before?: string) => {
    const p = new URLSearchParams();
    if (authorHandle) p.set('authorHandle', authorHandle);
    else if (scope === 'following') p.set('scope', 'following');
    if (before) p.set('before', before);
    return `/api/posts?${p.toString()}`;
  };

  // Publicás en tu propio perfil, o en el feed global — nunca "como
  // composer" en el perfil de otra persona.
  const canPost = authorHandle === undefined ? loggedIn && !!currentProfileHandle : authorHandle === currentProfileHandle;

  useEffect(() => {
    setLoading(true);
    fetch(buildQuery())
      .then(res => res.json())
      .then(data => {
        setPosts(data.posts ?? []);
        setHasMore(!!data.hasMore);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorHandle, scope]);

  const loadMore = useCallback(() => {
    const oldest = posts[posts.length - 1];
    if (!oldest || loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetch(buildQuery(oldest.created_at))
      .then(res => res.json())
      .then(data => {
        setPosts(prev => [...prev, ...(data.posts ?? [])]);
        setHasMore(!!data.hasMore);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, loadingMore, hasMore, authorHandle, scope]);

  // Infinite scroll — reemplaza el botón "Cargar más" por un sentinel
  // invisible al final de la lista que dispara la siguiente página apenas
  // entra en viewport.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore();
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPosting(true);
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text, imageUrl }),
    });
    setPosting(false);
    if (res.ok) {
      const created: ApiPost = await res.json();
      setPosts(prev => [created, ...prev]);
      setText('');
      setImageUrl('');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo publicar.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Borrar este post?')) return;
    const res = await fetch(`/api/posts/${id}`, { method: 'DELETE' });
    if (res.ok) setPosts(prev => prev.filter(p => p.id !== id));
    else toast('No se pudo borrar.', 'error');
  };

  const handleToggleLike = async (post: ApiPost) => {
    if (!loggedIn) {
      toast('Iniciá sesión para dar like.', 'error');
      return;
    }
    const nextLiked = !post.likedByMe;
    setPosts(prev => prev.map(p => (p.id === post.id
      ? { ...p, likedByMe: nextLiked, likeCount: p.likeCount + (nextLiked ? 1 : -1) }
      : p)));
    const res = await fetch(`/api/posts/${post.id}/like`, { method: nextLiked ? 'POST' : 'DELETE' });
    if (!res.ok) {
      // revertir si falló
      setPosts(prev => prev.map(p => (p.id === post.id
        ? { ...p, likedByMe: !nextLiked, likeCount: p.likeCount + (nextLiked ? -1 : 1) }
        : p)));
      toast('No se pudo actualizar el like.', 'error');
    }
  };

  const submitRepost = async () => {
    if (!repostingPost) return;
    setReposting(true);
    // Repostear un repost apunta siempre al original, no encadena reposts.
    const sharedPostId = repostingPost.shared_post ? repostingPost.shared_post.id : repostingPost.id;
    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: repostText.trim(), sharedPostId }),
    });
    setReposting(false);
    if (res.ok) {
      const created: ApiPost = await res.json();
      if (authorHandle === undefined) setPosts(prev => [created, ...prev]);
      setRepostingPost(null);
      setRepostText('');
      toast('Reposteado.');
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo repostear.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <PostSkeleton />
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }
  // Perfil ajeno sin nada publicado — no tiene sentido mostrar la sección.
  if (authorHandle !== undefined && !canPost && posts.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {canPost ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-trevo-dark/10 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
              {currentAvatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentAvatarImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-trevo-dark/40 font-medium">{(currentProfileHandle ?? 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <MentionTextarea
              value={text}
              onChange={setText}
              rows={3}
              maxLength={2000}
              placeholder="¿Qué estás compartiendo? Usá @ para mencionar a alguien"
              className="w-full px-3 py-2 rounded-lg border border-trevo-dark/15 text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 focus:border-trevo-dark/30 outline-none transition-all resize-none"
            />
          </div>
          <ImageUploader label="Imagen (opcional)" value={imageUrl} onChange={setImageUrl} folder="posts" />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={posting || !text.trim()}
              className="btn-solid-green disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {posting ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </form>
      ) : authorHandle === undefined && !loggedIn ? (
        <p className="text-center text-trevo-dark/50 font-light py-6 border border-dashed border-trevo-dark/15 rounded-xl">
          <a href="/admin/login" className="text-trevo-dark underline hover:no-underline">Iniciá sesión</a> para publicar.
        </p>
      ) : authorHandle === undefined && loggedIn && !currentProfileHandle ? (
        <p className="text-center text-trevo-dark/50 font-light py-6 border border-dashed border-trevo-dark/15 rounded-xl">
          <a href="/admin/portfolio" className="text-trevo-dark underline hover:no-underline">Creá tu portfolio</a> para poder publicar.
        </p>
      ) : null}

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => (
            <div key={post.id} className="bg-white rounded-2xl border border-trevo-dark/10 p-5">
              {post.shared_post && post.author && (
                <p className="flex items-center gap-1.5 text-xs font-medium text-trevo-dark/40 mb-3">
                  <Repeat2 className="w-3.5 h-3.5" />
                  {post.author.handle === currentProfileHandle ? 'Reposteaste esto' : `${post.author.display_name} reposteó esto`}
                </p>
              )}
              <div className="flex items-start gap-3">
                {post.author ? (
                  <ProfileHoverCard handle={post.author.handle} loggedIn={loggedIn} isOwnProfile={post.author.handle === currentProfileHandle}>
                    <Link href={`/portfolio/${post.author.handle}`} className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                      {post.author.avatar_image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.author.avatar_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm text-trevo-dark/40 font-medium">{post.author.display_name.charAt(0).toUpperCase()}</span>
                      )}
                    </Link>
                  </ProfileHoverCard>
                ) : (
                  <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
                    <span className="text-sm text-trevo-dark/40 font-medium">U</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {post.author && (
                      <ProfileHoverCard handle={post.author.handle} loggedIn={loggedIn} isOwnProfile={post.author.handle === currentProfileHandle}>
                        <Link href={`/portfolio/${post.author.handle}`} className="text-sm font-medium text-trevo-dark hover:underline">
                          {post.author.display_name}
                        </Link>
                      </ProfileHoverCard>
                    )}
                    <span className="text-xs text-trevo-dark/30">
                      {formatRelativeTime(post.created_at)}
                    </span>
                  </div>
                  {post.body && <p className="text-trevo-dark/80 font-light mt-1 whitespace-pre-line"><MentionText text={post.body} /></p>}
                </div>
                {post.author?.handle === currentProfileHandle && (
                  <KebabMenu items={[{ label: 'Borrar', onClick: () => handleDelete(post.id), danger: true }]} />
                )}
              </div>
              {post.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.image_url} alt="" className="w-full rounded-xl mt-3 max-h-96 object-cover" />
              )}
              {post.shared_post && (
                <div className="mt-3">
                  <EmbeddedPostCard post={post.shared_post} />
                </div>
              )}
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-trevo-dark/5">
                <button
                  onClick={() => handleToggleLike(post)}
                  className={`text-sm flex items-center gap-1.5 transition-colors ${post.likedByMe ? 'text-red-500 font-medium' : 'text-trevo-dark/50 hover:text-trevo-dark'}`}
                >
                  {post.likedByMe ? '♥' : '♡'} {post.likeCount > 0 && post.likeCount}
                </button>
                <button
                  onClick={() => setExpandedPostId(prev => (prev === post.id ? null : post.id))}
                  className="text-sm text-trevo-dark/50 hover:text-trevo-dark transition-colors"
                >
                  💬 {post.commentCount > 0 ? post.commentCount : 'Comentar'}
                </button>
                <button
                  onClick={() => {
                    if (!loggedIn) { toast('Iniciá sesión para repostear.', 'error'); return; }
                    setRepostingPost(post);
                    setRepostText('');
                  }}
                  className="text-sm text-trevo-dark/50 hover:text-trevo-dark transition-colors flex items-center gap-1.5"
                >
                  <Repeat2 className="w-4 h-4" /> Repostear
                </button>
                <button
                  onClick={() => {
                    if (!loggedIn) { toast('Iniciá sesión para enviar posts.', 'error'); return; }
                    setSendingPostId(post.shared_post ? post.shared_post.id : post.id);
                  }}
                  className="text-sm text-trevo-dark/50 hover:text-trevo-dark transition-colors flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" /> Enviar
                </button>
                {post.author && (
                  <ShareMenu
                    url={typeof window !== 'undefined' ? `${window.location.origin}/portfolio/${post.author.handle}` : `/portfolio/${post.author.handle}`}
                    text={`${post.author.display_name} en 360 — ${post.body.slice(0, 120)}`}
                  >
                    {(trigger) => (
                      <button
                        {...trigger}
                        className="text-sm text-trevo-dark/50 hover:text-trevo-dark transition-colors flex items-center gap-1.5"
                      >
                        <Share2 className="w-4 h-4" /> Compartir
                      </button>
                    )}
                  </ShareMenu>
                )}
              </div>
              {expandedPostId === post.id && (
                <div className="mt-4 pt-4 border-t border-trevo-dark/5">
                  <CommentSection entityType="post" entityId={post.id} />
                </div>
              )}
            </div>
          ))}
          {hasMore && (
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore && <span className="text-sm text-trevo-dark/40">Cargando más...</span>}
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Rss className="w-6 h-6" />}
          title={scope === 'following'
            ? 'Aún no hay posts de las personas que seguís.'
            : authorHandle === undefined
              ? 'Todavía no hay posts — ¡sé el primero en publicar!'
              : 'Todavía no hay posts publicados acá.'}
          action={scope === 'following' ? <div className="lg:hidden"><PeopleSuggestions /></div> : undefined}
        />
      )}

      {/* Si hay posts pero es el scope de following, metemos sugerencias al final igual para discovery (solo mobile, ver comentario arriba) */}
      {posts.length > 0 && scope === 'following' && !hasMore && (
        <div className="pt-8 border-t border-trevo-dark/10 lg:hidden">
          <PeopleSuggestions />
        </div>
      )}

      {repostingPost && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-0 sm:px-4" onClick={() => !reposting && setRepostingPost(null)}>
          <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-trevo-dark/10">
              <h2 className="font-semibold text-trevo-dark">Repostear</h2>
              <button onClick={() => setRepostingPost(null)} className="p-1 text-trevo-dark/40 hover:text-trevo-dark transition-colors" aria-label="Cerrar">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <MentionTextarea
                value={repostText}
                onChange={setRepostText}
                rows={3}
                maxLength={2000}
                placeholder="Agregá un comentario (opcional)..."
                className="w-full px-3.5 py-2 rounded-lg border border-trevo-dark/15 text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/20 outline-none transition-all resize-none"
              />
              <EmbeddedPostCard post={repostingPost.shared_post ?? repostingPost} />
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-trevo-dark/10">
              <button onClick={() => setRepostingPost(null)} disabled={reposting} className="px-4 py-2 text-sm font-medium text-trevo-dark/50 hover:text-trevo-dark transition-colors disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={submitRepost} disabled={reposting} className="px-4 py-2 rounded-lg bg-trevo-dark text-white text-sm font-medium hover:bg-trevo-dark/90 transition-colors disabled:opacity-50">
                {reposting ? 'Reposteando...' : 'Repostear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sendingPostId && (
        <SendPostModal postId={sendingPostId} onClose={() => setSendingPostId(null)} />
      )}
    </div>
  );
}
