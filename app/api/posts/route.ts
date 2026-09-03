import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { extractMentionedHandles } from '@/lib/mentions';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline } from '@/lib/sanitize';
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
const AUTHOR_SELECT = '*, author:profiles(handle, display_name, avatar_image, bio)';
const SAMPLE_LIKERS_PER_POST = 3;

interface SampleLiker {
  display_name: string;
  avatar_image: string | null;
}

// Suma likeCount/likedByMe/commentCount/savedByMe/sampleLikers/shared_post
// a cada post en una sola pasada — evita que el cliente tenga que pedirlo
// post por post.
async function withCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posts: { id: string; shared_post_id: string | null }[],
  currentUserId: string | undefined
) {
  const postIds = posts.map(p => p.id);
  const sharedPostIds = [...new Set(posts.map(p => p.shared_post_id).filter((id): id is string => !!id))];
  if (postIds.length === 0) return posts.map(p => ({ ...p, shared_post: null, likeCount: 0, likedByMe: false, commentCount: 0, savedByMe: false, sampleLikers: [] as SampleLiker[] }));

  const [{ data: likeRows }, { data: commentRows }, { data: sharedPostRows }, { data: savedRows }] = await Promise.all([
    // Se pide más reciente primero y con el perfil embebido: sirve tanto
    // para el conteo/likedByMe como para el facepile de "quién le dio
    // like" sin una query aparte.
    supabase.from('post_likes')
      .select('post_id, profile_id, profile:profiles(display_name, avatar_image)')
      .in('post_id', postIds)
      .order('created_at', { ascending: false }),
    supabase.from('post_comments').select('post_id').in('post_id', postIds),
    sharedPostIds.length > 0
      ? supabase.from('posts').select(SHARED_POST_SELECT).in('id', sharedPostIds)
      : Promise.resolve({ data: [] }),
    currentUserId
      ? supabase.from('saved_posts').select('post_id').eq('profile_id', currentUserId).in('post_id', postIds)
      : Promise.resolve({ data: [] }),
  ]);

  const likeCountByPost = new Map<string, number>();
  const likedByMe = new Set<string>();
  const sampleLikersByPost = new Map<string, SampleLiker[]>();
  for (const l of (likeRows ?? []) as unknown as { post_id: string; profile_id: string; profile: SampleLiker | SampleLiker[] | null }[]) {
    likeCountByPost.set(l.post_id, (likeCountByPost.get(l.post_id) ?? 0) + 1);
    if (currentUserId && l.profile_id === currentUserId) likedByMe.add(l.post_id);
    // El cliente de Supabase tipa el embed a-uno como array en algunos
    // casos y como objeto en otros, según cómo infiera la relación — se
    // normaliza acá en vez de depender de una forma fija.
    const profile = Array.isArray(l.profile) ? l.profile[0] : l.profile;
    if (profile) {
      const existing = sampleLikersByPost.get(l.post_id) ?? [];
      if (existing.length < SAMPLE_LIKERS_PER_POST) {
        existing.push(profile);
        sampleLikersByPost.set(l.post_id, existing);
      }
    }
  }
  const commentCountByPost = new Map<string, number>();
  for (const c of (commentRows ?? [])) {
    commentCountByPost.set(c.post_id, (commentCountByPost.get(c.post_id) ?? 0) + 1);
  }
  const sharedPostById = new Map((sharedPostRows as EmbeddedPost[] ?? []).map(sp => [sp.id, sp]));
  const savedByMe = new Set((savedRows as { post_id: string }[] ?? []).map(r => r.post_id));

  return posts.map(p => ({
    ...p,
    shared_post: p.shared_post_id ? (sharedPostById.get(p.shared_post_id) ?? null) : null,
    likeCount: likeCountByPost.get(p.id) ?? 0,
    likedByMe: likedByMe.has(p.id),
    commentCount: commentCountByPost.get(p.id) ?? 0,
    savedByMe: savedByMe.has(p.id),
    sampleLikers: sampleLikersByPost.get(p.id) ?? [],
  }));
}

// Resuelve el conjunto de project ids donde el usuario es dueño o
// colaborador aceptado — base tanto para saber "en qué proyectos trabajo"
// como, a partir de ahí, "con quién trabajo" (scope=collaborations).
async function getMyProjectIds(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string[]> {
  const [{ data: owned }, { data: collabs }] = await Promise.all([
    supabase.from('projects').select('id').eq('owner_id', userId),
    supabase.from('project_collaborators').select('project_id').eq('profile_id', userId).eq('status', 'accepted'),
  ]);
  return [...new Set([...(owned ?? []).map((p: { id: string }) => p.id), ...(collabs ?? []).map((r: { project_id: string }) => r.project_id)])];
}

// Ventana sobre la que se calcula "Destacados" — no hay paginación por
// scroll infinito en este modo (ver comentario más abajo), así que alcanza
// con mirar los posts recientes en vez de la tabla entera.
const TOP_SORT_WINDOW = 100;

// Sin authorHandle → feed global, de siguiendo, de colaboraciones o de
// guardados (según scope). Con authorHandle → solo los posts de ese perfil.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorHandle = searchParams.get('authorHandle');
  const before = searchParams.get('before');
  const scope = searchParams.get('scope'); // 'following' | 'collaborations' | 'saved' | null
  const sort = searchParams.get('sort'); // 'top' | null (default: más recientes primero)

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const isTopSort = sort === 'top';
  let query = supabase.from('posts').select(AUTHOR_SELECT).order('created_at', { ascending: false })
    .limit(isTopSort ? TOP_SORT_WINDOW : PAGE_SIZE + 1);
  // "Destacados" siempre mira la ventana reciente completa de nuevo — no
  // tiene cursor propio, así que ignora `before`.
  if (before && !isTopSort) query = query.lt('created_at', before);

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
  } else if (scope === 'collaborations' && user) {
    // Posts de gente con la que trabajo: dueños y colaboradores aceptados
    // de cualquier proyecto donde yo sea dueño o colaborador aceptado.
    const projectIds = await getMyProjectIds(supabase, user.id);
    if (projectIds.length === 0) return NextResponse.json({ posts: [], hasMore: false });
    const [{ data: projectOwners }, { data: collaboratorRows }] = await Promise.all([
      supabase.from('projects').select('owner_id').in('id', projectIds),
      supabase.from('project_collaborators').select('profile_id').in('project_id', projectIds).eq('status', 'accepted'),
    ]);
    const authorIds = [...new Set([
      ...(projectOwners ?? []).map((p: { owner_id: string }) => p.owner_id),
      ...(collaboratorRows ?? []).map((r: { profile_id: string }) => r.profile_id),
    ])];
    if (authorIds.length === 0) return NextResponse.json({ posts: [], hasMore: false });
    query = query.in('author_id', authorIds);
  } else if (scope === 'saved' && user) {
    // Solo mis posts guardados — requiere perfil propio (saved_posts.profile_id).
    const { data: savedRows } = await supabase.from('saved_posts').select('post_id').eq('profile_id', user.id);
    const savedIds = (savedRows ?? []).map((r: { post_id: string }) => r.post_id);
    if (savedIds.length === 0) return NextResponse.json({ posts: [], hasMore: false });
    query = query.in('id', savedIds);
  }
  // scope=global o no logueado → query sin filtro adicional (feed global)

  const { data, error } = await query;
  if (error) return NextResponse.json({ posts: [], hasMore: false });

  const rows = data ?? [];

  if (isTopSort) {
    // Sin paginación por scroll para "Destacados" — se trae la ventana
    // reciente completa, se ordena por likeCount y se corta a PAGE_SIZE.
    const withCountsRows = await withCounts(supabase, rows, user?.id);
    withCountsRows.sort((a, b) => b.likeCount - a.likeCount);
    return NextResponse.json({ posts: withCountsRows.slice(0, PAGE_SIZE), hasMore: false });
  }

  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ posts: await withCounts(supabase, page, user?.id), hasMore });
}

const postSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).optional(),
  sharedPostId: uuidSchema.optional(),
  imageUrl: z.url().max(1000).optional(),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profile) {
    return NextResponse.json({ error: 'Creá tu portfolio antes de publicar.' }, { status: 400 });
  }

  const parsed = await parseJsonBody(request, postSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const text = sanitizeMultiline(body.body, MAX_BODY_LENGTH);
  const sharedPostId = body.sharedPostId ?? null;
  // Un repost puede ir sin comentario propio — un post normal sí necesita texto.
  if (!text && !sharedPostId) return NextResponse.json({ error: 'Falta el texto del post' }, { status: 400 });

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
