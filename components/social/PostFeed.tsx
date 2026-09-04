'use client';

import { useState, useEffect, useRef, useCallback, startTransition } from 'react';
import { Rss, Repeat2, Bookmark, Heart, MessageCircle, X, MoreHorizontal, Image as ImageIcon, Building2, Compass, BarChart2 } from 'lucide-react';
import { extractHashtags } from '@/lib/hashtags';
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
import { PostSkeleton } from '@/components/ui/Skeleton';
import { formatRelativeTime } from '@/lib/relativeTime';
import PostProjectEmbed, { type EmbeddedProject } from '@/components/social/PostProjectEmbed';
import PostPoll, { type Poll } from '@/components/social/PostPoll';
import PollComposer from '@/components/social/PollComposer';
import AttachProjectPicker, { type AttachableProject } from '@/components/social/AttachProjectPicker';

interface SampleLiker {
  display_name: string;
  avatar_image: string | null;
}

interface ApiPost {
  id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null; bio: string | null } | null;
  shared_post: EmbeddedPost | null;
  shared_project_kind: 'project' | 'tour' | null;
  project: EmbeddedProject | null;
  poll: Poll | null;
  likeCount: number;
  likedByMe: boolean;
  commentCount: number;
  savedByMe: boolean;
  sampleLikers: SampleLiker[];
}

// Mismo puñado de colores de avatar del mockup Feed.dc.html, para el
// facepile de "quién le dio like" cuando esa persona no tiene foto.
const AVATAR_FALLBACK_COLORS = ['#c98a5e', '#5c7a58', '#7d8fa3', '#9a8560'];
const MIN_POLL_OPTIONS = 2;
const MAX_POLL_OPTIONS = 4;

type Attachment = 'none' | 'image' | 'project' | 'tour' | 'poll';

interface PostFeedProps {
  /** Sin esto, es el feed global (todos los posts). Con esto, solo los de ese perfil. */
  authorHandle?: string;
  loggedIn: boolean;
  /** El handle propio de quien está mirando, si tiene perfil — determina si puede publicar/borrar acá. */
  currentProfileHandle: string | null;
  /** Avatar propio, para mostrarlo junto al composer — undefined si no tiene. */
  currentAvatarImage?: string | null;
  /** 'following' = gente seguida. 'collaborations' = gente con la que trabajo. 'saved' = mis guardados. Ignorado si se pasa authorHandle. */
  scope?: 'following' | 'global' | 'collaborations' | 'saved';
  /** 'top' = ordenado por likes, sin scroll infinito. Default: más recientes primero. */
  sort?: 'recent' | 'top';
  /** Solo posts que mencionan este hashtag (sin '#') — página de tendencia/etiqueta. Ignorado junto con authorHandle/scope/sort. */
  tag?: string;
}

export default function PostFeed({ authorHandle, loggedIn, currentProfileHandle, currentAvatarImage, scope, sort, tag }: PostFeedProps) {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [attachment, setAttachment] = useState<Attachment>('none');
  const [imageUrl, setImageUrl] = useState('');
  const [attachedProject, setAttachedProject] = useState<AttachableProject | null>(null);
  const [projectPickerKind, setProjectPickerKind] = useState<'project' | 'tour' | null>(null);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [repostingPost, setRepostingPost] = useState<ApiPost | null>(null);
  const [repostText, setRepostText] = useState('');
  const [reposting, setReposting] = useState(false);
  const [sendingPostId, setSendingPostId] = useState<string | null>(null);
  const [openMenuPostId, setOpenMenuPostId] = useState<string | null>(null);
  const toast = useToast();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const buildQuery = (before?: string) => {
    const p = new URLSearchParams();
    if (tag) p.set('tag', tag);
    else if (authorHandle) p.set('authorHandle', authorHandle);
    else if (scope && scope !== 'global') p.set('scope', scope);
    if (sort === 'top') p.set('sort', 'top');
    if (before) p.set('before', before);
    return `/api/posts?${p.toString()}`;
  };

  // FeedTabs ya no remonta este componente al cambiar de tab (ver su
  // comentario) — sin eso, una respuesta que llega tarde de un scope
  // anterior podría pisar la lista del scope actual. queryKey identifica
  // "para qué búsqueda es esta respuesta"; si cambió desde que se lanzó
  // el fetch, se descarta en vez de aplicarse.
  const queryKey = `${tag ?? ''}|${authorHandle ?? ''}|${scope ?? ''}|${sort ?? ''}`;
  const queryKeyRef = useRef(queryKey);

  // Publicás en tu propio perfil, o en el feed global — nunca "como
  // composer" en el perfil de otra persona, ni en la lista de guardados
  // (es una vista de lectura, no un lugar donde postear), ni en una
  // página de etiqueta (es una vista de búsqueda).
  const canPost = tag !== undefined
    ? false
    : authorHandle === undefined
      ? scope !== 'saved' && loggedIn && !!currentProfileHandle
      : authorHandle === currentProfileHandle;

  useEffect(() => {
    queryKeyRef.current = queryKey;
    const thisKey = queryKey;
    startTransition(() => setLoading(true));
    fetch(buildQuery())
      .then(res => res.json())
      .then(data => {
        if (queryKeyRef.current !== thisKey) return; // se cambió de tab/orden antes de que llegara
        setPosts(data.posts ?? []);
        setHasMore(!!data.hasMore);
        setLoading(false);
      })
      .catch(() => { if (queryKeyRef.current === thisKey) setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey]);

  const loadMore = useCallback(() => {
    const oldest = posts[posts.length - 1];
    if (!oldest || loadingMore || !hasMore) return;
    const thisKey = queryKeyRef.current;
    setLoadingMore(true);
    fetch(buildQuery(oldest.created_at))
      .then(res => res.json())
      .then(data => {
        if (queryKeyRef.current !== thisKey) return;
        setPosts(prev => [...prev, ...(data.posts ?? [])]);
        setHasMore(!!data.hasMore);
        setLoadingMore(false);
      })
      .catch(() => setLoadingMore(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts, loadingMore, hasMore, authorHandle, scope, sort, tag]);

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

  useEffect(() => {
    if (!openMenuPostId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuPostId(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuPostId]);

  const resetComposer = () => {
    setText('');
    setComposerOpen(false);
    setAttachment('none');
    setImageUrl('');
    setAttachedProject(null);
    setProjectPickerKind(null);
    setPollQuestion('');
    setPollOptions(['', '']);
  };

  // Imagen y encuesta se togglean directo; Proyecto/Recorrido 360 primero
  // abren el picker (ver handleAttachProject) y solo pasan a ser el
  // adjunto activo cuando se elige uno — así "clickear el botón" y
  // "quedar attachado" son cosas distintas para esos dos.
  const toggleAttachment = (next: 'image' | 'poll') => {
    if (attachment === next) {
      setAttachment('none');
      setImageUrl('');
      return;
    }
    setAttachment(next);
    setImageUrl('');
    setAttachedProject(null);
  };

  const handleAttachProject = (kind: 'project' | 'tour') => (project: AttachableProject) => {
    setAttachment(kind);
    setAttachedProject(project);
    setImageUrl('');
    setPollQuestion('');
    setPollOptions(['', '']);
    setProjectPickerKind(null);
  };

  const removeAttachment = () => {
    setAttachment('none');
    setImageUrl('');
    setAttachedProject(null);
  };

  const pollOptionsFilled = pollOptions.map(o => o.trim()).filter(Boolean);
  const hasPollContent = attachment === 'poll' && pollQuestion.trim().length > 0 && pollOptionsFilled.length >= MIN_POLL_OPTIONS;
  const canPublish = text.trim().length > 0
    || (attachment === 'image' && !!imageUrl)
    || ((attachment === 'project' || attachment === 'tour') && !!attachedProject)
    || hasPollContent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canPublish || posting) return;
    setPosting(true);
    const payload: Record<string, unknown> = { body: text };
    if (attachment === 'image' && imageUrl) payload.imageUrl = imageUrl;
    if ((attachment === 'project' || attachment === 'tour') && attachedProject) {
      payload.sharedProjectId = attachedProject.id;
      payload.sharedProjectKind = attachment;
    }
    if (hasPollContent) payload.poll = { question: pollQuestion.trim(), options: pollOptionsFilled };

    const res = await fetch('/api/posts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPosting(false);
    if (res.ok) {
      const created: ApiPost = await res.json();
      setPosts(prev => [created, ...prev]);
      resetComposer();
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

  const handleToggleSave = async (post: ApiPost) => {
    if (!loggedIn) {
      toast('Iniciá sesión para guardar posts.', 'error');
      return;
    }
    const nextSaved = !post.savedByMe;
    setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, savedByMe: nextSaved } : p)));
    const res = await fetch(`/api/posts/${post.id}/save`, { method: nextSaved ? 'POST' : 'DELETE' });
    if (!res.ok) {
      setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, savedByMe: !nextSaved } : p)));
      toast('No se pudo actualizar el guardado.', 'error');
    } else if (nextSaved) {
      toast('Guardado.');
    } else if (scope === 'saved') {
      // En "Guardados" mismo, sacar el guardado tiene que sacar el post de la lista.
      setPosts(prev => prev.filter(p => p.id !== post.id));
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

  // Solo pantalla de skeletons completa en la carga inicial (sin nada
  // todavía que mostrar). Un cambio de tab/orden con posts ya en pantalla
  // no vuelve a esta pantalla — ver el dimmed de más abajo — para no
  // reemplazar todo por skeletons de otro tamaño en cada click.
  if (loading && posts.length === 0) {
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
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-trevo-dark/10 p-4">
          <div className="flex items-start gap-3">
            <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0 bg-trevo-dark/10 flex items-center justify-center">
              {currentAvatarImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentAvatarImage} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-sm text-trevo-dark/40 font-medium">{(currentProfileHandle ?? 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              {composerOpen ? (
                <MentionTextarea
                  value={text}
                  onChange={setText}
                  rows={3}
                  maxLength={2000}
                  autoFocus
                  placeholder="Escribí acá... usá @ para mencionar a alguien"
                  className="w-full px-3.5 py-2.5 rounded-[11px] border border-trevo-dark/15 bg-[#faf9f6] text-trevo-dark placeholder:text-trevo-dark/30 focus:ring-2 focus:ring-trevo-dark/10 focus:border-trevo-dark/25 outline-none transition-all resize-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setComposerOpen(true)}
                  className="w-full min-h-11 px-3.5 rounded-[11px] border border-trevo-dark/15 bg-[#faf9f6] text-left font-light text-[13.5px] text-trevo-dark/40"
                >
                  ¿Qué estás compartiendo? Usá @ para mencionar a alguien
                </button>
              )}

              {composerOpen && attachment === 'image' && (
                <div className="mt-3">
                  <ImageUploader value={imageUrl} onChange={setImageUrl} folder="posts" />
                </div>
              )}

              {composerOpen && attachment === 'poll' && (
                <PollComposer
                  question={pollQuestion}
                  options={pollOptions}
                  onQuestionChange={setPollQuestion}
                  onOptionChange={(i, value) => setPollOptions(prev => prev.map((o, idx) => (idx === i ? value : o)))}
                  onAddOption={() => setPollOptions(prev => (prev.length < MAX_POLL_OPTIONS ? [...prev, ''] : prev))}
                  onRemoveOption={i => setPollOptions(prev => prev.filter((_, idx) => idx !== i))}
                />
              )}

              {composerOpen && (attachment === 'project' || attachment === 'tour') && attachedProject && (
                <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-xl border border-dashed" style={{ borderColor: 'rgba(28,25,23,0.16)' }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium tracking-[0.1em] text-trevo-dark/40">{attachment === 'tour' ? 'RECORRIDO 360' : 'PROYECTO'}</p>
                    <p className="text-[13px] font-medium text-trevo-dark truncate">{attachedProject.name}</p>
                  </div>
                  <button type="button" onClick={removeAttachment} className="p-1.5 text-trevo-dark/30 hover:text-trevo-dark transition-colors" aria-label="Quitar adjunto">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {composerOpen && (
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <button
                    type="button"
                    onClick={() => toggleAttachment('image')}
                    className="h-8 px-2.5 flex items-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-colors"
                    style={attachment === 'image' ? { background: 'rgba(92,122,88,0.12)', color: '#4a6647' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.66)' }}
                  >
                    <ImageIcon className="w-3.5 h-3.5" /> Imagen
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProjectPickerKind(k => (k === 'project' ? null : 'project'))}
                      className="h-8 px-2.5 flex items-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-colors"
                      style={attachment === 'project' ? { background: 'rgba(92,122,88,0.12)', color: '#4a6647' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.66)' }}
                    >
                      <Building2 className="w-3.5 h-3.5" /> Proyecto
                    </button>
                    {projectPickerKind === 'project' && (
                      <AttachProjectPicker kind="project" onSelect={handleAttachProject('project')} onClose={() => setProjectPickerKind(null)} />
                    )}
                  </div>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setProjectPickerKind(k => (k === 'tour' ? null : 'tour'))}
                      className="h-8 px-2.5 flex items-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-colors"
                      style={attachment === 'tour' ? { background: 'rgba(92,122,88,0.12)', color: '#4a6647' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.66)' }}
                    >
                      <Compass className="w-3.5 h-3.5" /> Recorrido 360
                    </button>
                    {projectPickerKind === 'tour' && (
                      <AttachProjectPicker kind="tour" onSelect={handleAttachProject('tour')} onClose={() => setProjectPickerKind(null)} />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleAttachment('poll')}
                    className="h-8 px-2.5 flex items-center gap-1.5 rounded-[9px] text-[11.5px] font-medium transition-colors"
                    style={attachment === 'poll' ? { background: 'rgba(92,122,88,0.12)', color: '#4a6647' } : { background: '#f5f4f0', color: 'rgba(28,25,23,0.66)' }}
                  >
                    <BarChart2 className="w-3.5 h-3.5" /> Encuesta
                  </button>
                  <div className="flex-1" />
                  <button
                    type="submit"
                    disabled={!canPublish || posting}
                    className="h-[34px] px-5 rounded-[9px] text-[12.5px] font-medium transition-colors disabled:cursor-default"
                    style={canPublish ? { background: '#1c1a17', color: '#fff' } : { background: '#e8e6e0', color: 'rgba(28,25,23,0.35)' }}
                  >
                    {posting ? 'Publicando...' : 'Publicar'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>
      ) : authorHandle === undefined && scope !== 'saved' && tag === undefined && !loggedIn ? (
        <p className="text-center text-trevo-dark/50 font-light py-6 border border-dashed border-trevo-dark/15 rounded-xl">
          <a href="/admin/login" className="text-trevo-dark underline hover:no-underline">Iniciá sesión</a> para publicar.
        </p>
      ) : authorHandle === undefined && scope !== 'saved' && tag === undefined && loggedIn && !currentProfileHandle ? (
        <p className="text-center text-trevo-dark/50 font-light py-6 border border-dashed border-trevo-dark/15 rounded-xl">
          <a href="/admin/portfolio" className="text-trevo-dark underline hover:no-underline">Creá tu portfolio</a> para poder publicar.
        </p>
      ) : null}

      {/* Atenuado (no reemplazado por skeletons) mientras se recarga por un
          cambio de tab/orden con posts ya en pantalla — evita el flash en
          blanco + resalto que daba remontar todo el feed en cada click. */}
      <div className={`transition-opacity duration-150 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map(post => {
            const tags = extractHashtags(post.body);
            const canShowHeaderMenu = !!post.author;
            const isOwnPost = post.author?.handle === currentProfileHandle;
            return (
              <div key={post.id} className="bg-white rounded-2xl border border-trevo-dark/10 p-5">
                {post.shared_post && post.author && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-trevo-dark/40 mb-3">
                    <Repeat2 className="w-3.5 h-3.5" />
                    {post.author.handle === currentProfileHandle ? 'Reposteaste esto' : `${post.author.display_name} reposteó esto`}
                  </p>
                )}
                <div className="flex items-start gap-3">
                  {post.author ? (
                    <ProfileHoverCard handle={post.author.handle} loggedIn={loggedIn} isOwnProfile={isOwnPost}>
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
                        <ProfileHoverCard handle={post.author.handle} loggedIn={loggedIn} isOwnProfile={isOwnPost}>
                          <Link href={`/portfolio/${post.author.handle}`} className="text-sm font-medium text-trevo-dark hover:underline">
                            {post.author.display_name}
                          </Link>
                        </ProfileHoverCard>
                      )}
                      <span className="text-xs text-trevo-dark/30">
                        {formatRelativeTime(post.created_at)}
                      </span>
                    </div>
                    {post.author?.bio && (
                      <p className="font-normal text-[11.5px] text-[rgba(28,25,23,0.45)] mt-px truncate">{post.author.bio}</p>
                    )}
                    {post.body && <p className="text-trevo-dark/80 font-light mt-1 whitespace-pre-line"><MentionText text={post.body} /></p>}
                  </div>
                  {canShowHeaderMenu && (
                    <div ref={openMenuPostId === post.id ? menuRef : undefined} className="relative shrink-0">
                      <button
                        onClick={() => setOpenMenuPostId(prev => (prev === post.id ? null : post.id))}
                        className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-trevo-dark/40 hover:bg-[#f5f4f0] hover:text-trevo-dark transition-colors"
                        aria-label="Más opciones"
                        aria-expanded={openMenuPostId === post.id}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuPostId === post.id && (
                        // Sin overflow-hidden acá: el submenú de ShareMenu se
                        // renderiza como un absolute DENTRO de este panel, y
                        // overflow-hidden lo recortaría en vez de dejarlo
                        // flotar por fuera. El redondeado se aplica por ítem.
                        <div className="absolute top-full right-0 mt-1 w-44 bg-white rounded-xl shadow-lg border border-trevo-dark/10 z-30 py-1 flex flex-col">
                          <button
                            onClick={() => {
                              setOpenMenuPostId(null);
                              if (!loggedIn) { toast('Iniciá sesión para enviar posts.', 'error'); return; }
                              setSendingPostId(post.shared_post ? post.shared_post.id : post.id);
                            }}
                            className="w-full text-left px-3.5 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors rounded-t-xl"
                          >
                            Enviar
                          </button>
                          <ShareMenu
                            url={typeof window !== 'undefined' ? `${window.location.origin}/portfolio/${post.author!.handle}` : `/portfolio/${post.author!.handle}`}
                            text={`${post.author!.display_name} en 360 — ${post.body.slice(0, 120)}`}
                          >
                            {trigger => (
                              <button
                                {...trigger}
                                className={`w-full text-left px-3.5 py-2 text-sm text-trevo-dark hover:bg-trevo-dark/5 transition-colors ${isOwnPost ? '' : 'rounded-b-xl'}`}
                              >
                                Compartir
                              </button>
                            )}
                          </ShareMenu>
                          {isOwnPost && (
                            <button
                              onClick={() => { setOpenMenuPostId(null); handleDelete(post.id); }}
                              className="w-full text-left px-3.5 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors border-t border-trevo-dark/5 rounded-b-xl"
                            >
                              Borrar
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {tags.length > 0 && (
                  <div className="flex gap-1.5 flex-wrap mt-2.5">
                    {tags.map(t => (
                      <Link
                        key={t}
                        href={`/etiqueta/${encodeURIComponent(t)}`}
                        className="h-6 px-2.5 rounded-[6px] bg-[#f5f4f0] text-[11px] font-medium text-[rgba(28,25,23,0.6)] flex items-center hover:bg-[rgba(92,122,88,0.13)] hover:text-[#4a6647] transition-colors"
                      >
                        #{t}
                      </Link>
                    ))}
                  </div>
                )}

                {post.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={post.image_url} alt="" className="w-full rounded-xl mt-3 max-h-96 object-cover" />
                )}
                {post.shared_post && (
                  <div className="mt-3">
                    <EmbeddedPostCard post={post.shared_post} />
                  </div>
                )}
                {post.project && post.shared_project_kind && (
                  <PostProjectEmbed project={post.project} kind={post.shared_project_kind} />
                )}
                {post.poll && (
                  <PostPoll
                    postId={post.id}
                    poll={post.poll}
                    loggedIn={loggedIn}
                    onChange={poll => setPosts(prev => prev.map(p => (p.id === post.id ? { ...p, poll } : p)))}
                  />
                )}

                {(post.likeCount > 0 || post.commentCount > 0) && (
                  <div className="flex items-center gap-2 mt-3 text-[11.5px] text-[rgba(28,25,23,0.45)]">
                    {post.sampleLikers.length > 0 && (
                      <div className="flex items-center">
                        {post.sampleLikers.map((liker, i) => (
                          <span
                            key={i}
                            className="w-[19px] h-[19px] rounded-full border-2 border-white flex items-center justify-center overflow-hidden text-[8px] font-semibold text-white/90"
                            style={{ background: AVATAR_FALLBACK_COLORS[i % AVATAR_FALLBACK_COLORS.length], marginLeft: i > 0 ? '-7px' : 0 }}
                          >
                            {liker.avatar_image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={liker.avatar_image} alt="" className="w-full h-full object-cover" />
                            ) : (
                              (liker.display_name || 'U').charAt(0).toUpperCase()
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    {post.likeCount > 0 && <span>{post.likeCount} reacción{post.likeCount === 1 ? '' : 'es'}</span>}
                    <span className="flex-1" />
                    {post.commentCount > 0 && <span>{post.commentCount} comentario{post.commentCount === 1 ? '' : 's'}</span>}
                  </div>
                )}

                <div className="flex gap-0.5 mt-2.5 pt-[9px] border-t" style={{ borderColor: 'rgba(28,25,23,0.07)' }}>
                  <button
                    onClick={() => handleToggleLike(post)}
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium transition-colors hover:bg-[#f5f4f0]"
                    style={post.likedByMe ? { color: '#4a6647', background: 'rgba(92,122,88,0.09)' } : { color: 'rgba(28,25,23,0.6)' }}
                  >
                    <Heart className="w-4 h-4" fill={post.likedByMe ? 'currentColor' : 'none'} /> Me gusta
                  </button>
                  <button
                    onClick={() => setExpandedPostId(prev => (prev === post.id ? null : post.id))}
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium transition-colors hover:bg-[#f5f4f0] hover:text-[#1c1a17]"
                    style={{ color: 'rgba(28,25,23,0.6)' }}
                  >
                    <MessageCircle className="w-4 h-4" /> Comentar
                  </button>
                  <button
                    onClick={() => {
                      if (!loggedIn) { toast('Iniciá sesión para repostear.', 'error'); return; }
                      setRepostingPost(post);
                      setRepostText('');
                    }}
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium transition-colors hover:bg-[#f5f4f0] hover:text-[#1c1a17]"
                    style={{ color: 'rgba(28,25,23,0.6)' }}
                  >
                    <Repeat2 className="w-4 h-4" /> Repostear
                  </button>
                  <button
                    onClick={() => handleToggleSave(post)}
                    className="flex-1 h-9 flex items-center justify-center gap-2 rounded-[9px] text-[12.5px] font-medium transition-colors hover:bg-[#f5f4f0]"
                    style={post.savedByMe ? { color: '#4a6647', background: 'rgba(92,122,88,0.09)' } : { color: 'rgba(28,25,23,0.6)' }}
                  >
                    <Bookmark className="w-4 h-4" fill={post.savedByMe ? 'currentColor' : 'none'} /> Guardar
                  </button>
                </div>
                {expandedPostId === post.id && (
                  <div className="mt-4 pt-4 border-t border-trevo-dark/5">
                    <CommentSection entityType="post" entityId={post.id} />
                  </div>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore && <span className="text-sm text-trevo-dark/40">Cargando más...</span>}
            </div>
          )}
        </div>
      ) : scope === 'saved' ? (
        // Calcado del mockup Feed.dc.html ("savedEmpty") — a diferencia del
        // resto de los vacíos de acá abajo, este tiene su propio ícono/CTA
        // en vez de pasar por el EmptyState genérico.
        <div className="bg-white rounded-2xl border border-dashed border-trevo-dark/[0.16] px-6 py-11 text-center">
          <p className="text-2xl text-trevo-dark/20">❑</p>
          <p className="font-medium text-[13.5px] text-trevo-dark mt-2.5">Todavía no guardaste nada</p>
          <p className="font-light text-xs leading-[1.55] text-trevo-dark/50 mt-1.5 max-w-[320px] mx-auto">
            Tocá <b className="font-medium">Guardar</b> en cualquier publicación y la vas a encontrar acá.
          </p>
          <Link href="/feed" className="inline-flex h-[34px] items-center px-4 mt-3.5 rounded-[9px] bg-trevo-dark text-white text-xs font-medium">
            Volver al feed
          </Link>
        </div>
      ) : (
        <EmptyState
          icon={<Rss className="w-6 h-6" />}
          title={tag !== undefined
            ? `Todavía no hay publicaciones con #${tag}.`
            : scope === 'following'
              ? 'Aún no hay posts de las personas que seguís.'
              : scope === 'collaborations'
                ? 'Todavía no hay posts de gente con la que trabajás en un proyecto.'
                : authorHandle === undefined
                  ? 'Todavía no hay posts — ¡sé el primero en publicar!'
                  : 'Todavía no hay posts publicados acá.'}
          action={scope === 'following' ? <div className="lg:hidden"><PeopleSuggestions /></div> : undefined}
        />
      )}
      </div>

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
