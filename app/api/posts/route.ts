import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { extractMentionedHandles } from '@/lib/mentions';
import type { EmbeddedPost } from '@/components/social/EmbeddedPostCard';

const PAGE_SIZE = 20;
const MAX_BODY_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_POSTS = 5;

// El repost embebe el post original completo (con su propio autor) — si
// el original fue borrado, shared_post_id ya quedó en null (on delete set
// null), así que acá simplemente no viene nada que embeber.
//
// shared_post NO se trae con un embed de PostgREST (`posts!fkey(...)`):
// al ser una FK autorreferenciada (posts.shared_post_id -> posts.id),
// PostgREST no resuelve el hint de forma confiable (ni por nombre de
// constraint ni por columna — en pruebas devolvía la dirección inversa,
// "quién repostea esto" en vez de "qué está reposteando esto"). En vez de
// depender de eso, se trae con una segunda query plana y se mergea acá,
// mismo patrón que likeCount/commentCount.
const SHARED_POST_SELECT = 'id, body, image_url, created_at, author:profiles(handle, display_name, avatar_image)';
const AUTHOR_SELECT = '*, author:profiles(handle, display_name, avatar_image)';

// Suma likeCount/likedByMe/commentCount/shared_post a cada post en una
// sola pasada — evita que el cliente tenga que pedirlo post por post.
async function withCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posts: { id: string; shared_post_id: string | null }[],
  currentUserId: string | undefined
) {
  const postIds = posts.map(p => p.id);
  const sharedPostIds = [...new Set(posts.map(p => p.shared_post_id).filter((id): id is string => !!id))];
  if (postIds.length === 0) return posts.map(p => ({ ...p, shared_post: null, likeCount: 0, likedByMe: false, commentCount: 0 }));

  const [{ data: likeRows }, { data: commentRows }, { data: sharedPostRows }] = await Promise.all([
    supabase.from('post_likes').select('post_id, profile_id').in('post_id', postIds),
    supabase.from('post_comments').select('post_id').in('post_id', postIds),
    sharedPostIds.length > 0
      ? supabase.from('posts').select(SHARED_POST_SELECT).in('id', sharedPostIds)
      : Promise.resolve({ data: [] }),
  ]);

  const likeCountByPost = new Map<string, number>();
  const likedByMe = new Set<string>();
  for (const l of (likeRows ?? [])) {
    likeCountByPost.set(l.post_id, (likeCountByPost.get(l.post_id) ?? 0) + 1);
    if (currentUserId && l.profile_id === currentUserId) likedByMe.add(l.post_id);
  }
  const commentCountByPost = new Map<string, number>();
  for (const c of (commentRows ?? [])) {
    commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1);
  }
  const sharedPostById = new Map((sharedPostRows as EmbeddedPost[] ?? []).map(sp => [sp.id, sp]));

  return posts.map(p => ({
    ...p,
    shared_post: p.shared_post_id ? (sharedPostById.get(p.shared_post_id) ?? null) : null,
    likeCount: likeCountByPost.get(p.id) ?? 0,
    likedByMe: likedByMe.has(p.id),
    commentCount: commentCountByPost.get(p.id) ?? 0,
  }));
}

// Sin authorHandle → feed global o feed de siguiendo (según scope).
// Con authorHandle → solo los posts de ese perfil.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorHandle = searchParams.get('authorHandle');
  const before = searchParams.get('before');
  const scope = searchParams.get('scope'); // 'following' | null

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let query = supabase.from('posts').select(AUTHOR_SELECT).order('created_at', { ascending: false }).limit(PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);

  if (authorHandle) {
    // Feed de perfil específico
    const { data: profile } = await supabase.from('profiles').select('id').eq('handle', authorHandle).maybeSingle();
    if (!profile) return NextResponse.json({ posts: [], hasMore: false });
    query = query.eq('author_id', profile.id);
  } else if (scope === 'following' && user) {
    // Feed personalizado: solo posts de gente que sigo + los míos
    const { data: myProfile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
    if (myProfile) {
      const { data: followingRows } = await supabase
        .from('follows').select('following_id').eq('follower_id', myProfile.id);
      const followingIds = (followingRows ?? []).map((r: { following_id: string }) => r.following_id);
      // Incluir los propios posts
      const ids = [...new Set([...followingIds, myProfile.id])];
      query = query.in('author_id', ids);
    }
  }
  // scope=global o no logueado → query sin filtro adicional (feed global)

  const { data, error } = await query;
  if (error) return NextResponse.json({ posts: [], hasMore: false });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ posts: await withCounts(supabase, page, user?.id), hasMore });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'Creá tu portfolio antes de publicar.' }, { status: 400 });
  }

  const body = await request.json();
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const sharedPostId = typeof body.sharedPostId === 'string' ? body.sharedPostId : null;
  // Un repost puede ir sin comentario propio — un post normal sí necesita texto.
  if (!text && !sharedPostId) return NextResponse.json({ error: 'Falta el texto del post' }, { status: 400 });
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `El post no puede superar los ${MAX_BODY_LENGTH} caracteres.` }, { status: 400 });
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_POSTS) {
    return NextResponse.json({ error: 'Estás publicando muy rápido — esperá unos minutos.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('posts')
    .insert({ author_id: user.id, body: text, image_url: body.imageUrl || null, shared_post_id: sharedPostId })
    .select(AUTHOR_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort — mismo criterio que el resto de notify(): nunca debe
  // tumbar la respuesta si falla.
  const mentionedHandles = extractMentionedHandles(text);
  if (mentionedHandles.length > 0) {
    const { data: mentioned } = await supabase.from('profiles').select('id').in('handle', mentionedHandles);
    for (const m of mentioned ?? []) {
      await notify(supabase, { recipientId: m.id, actorId: user.id, type: 'mention', entityId: data.id });
    }
  }

  const [created] = await withCounts(supabase, [data], user.id);
  return NextResponse.json(created, { status: 201 });
}
