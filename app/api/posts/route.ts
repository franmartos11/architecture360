import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { extractMentionedHandles } from '@/lib/mentions';
import { extractHashtags } from '@/lib/hashtags';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline, sanitizeText } from '@/lib/sanitize';
import type { EmbeddedPost } from '@/components/social/EmbeddedPostCard';

const PAGE_SIZE = 20;
const MAX_BODY_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_POSTS = 5;
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;

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
// shared_project_id SÍ se puede embeber directo: a diferencia de
// shared_post_id, es la única FK de posts hacia projects, sin ambigüedad.
const AUTHOR_SELECT = '*, author:profiles(handle, display_name, avatar_image, bio), project:projects(id, name, slug, location, masterplan_image)';
const SAMPLE_LIKERS_PER_POST = 3;
// Ventana sobre la que se busca un hashtag — como no hay columna de tags
// propia (ver /api/posts/trending-tags), se trae un lote reciente y se
// filtra en memoria, mismo criterio que "Destacados" más abajo.
const TAG_SEARCH_WINDOW = 300;

interface SampleLiker {
  display_name: string;
  avatar_image: string | null;
}

interface PollOptionRow {
  id: string;
  poll_id: string;
  label: string;
  position: number;
}

// Suma likeCount/likedByMe/commentCount/savedByMe/sampleLikers/shared_post/
// poll a cada post en una sola pasada — evita que el cliente tenga que
// pedirlo post por post.
async function withCounts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  posts: { id: string; shared_post_id: string | null }[],
  currentUserId: string | undefined
) {
  const postIds = posts.map(p => p.id);
  const sharedPostIds = [...new Set(posts.map(p => p.shared_post_id).filter((id): id is string => !!id))];
  if (postIds.length === 0) {
    return posts.map(p => ({
      ...p, shared_post: null, likeCount: 0, likedByMe: false, commentCount: 0, savedByMe: false,
      sampleLikers: [] as SampleLiker[], poll: null,
    }));
  }

  const [{ data: likeRows }, { data: commentRows }, { data: sharedPostRows }, { data: savedRows }, { data: pollRows }] = await Promise.all([
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
    supabase.from('post_polls').select('id, post_id, question').in('post_id', postIds),
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

  // Encuesta: post_polls -> post_poll_options -> post_poll_votes, en tres
  // pasadas (nunca son muchas filas — como máximo MAX_POLL_OPTIONS por
  // encuesta) y se arma el conteo en memoria, mismo patrón que arriba.
  const polls = (pollRows ?? []) as { id: string; post_id: string; question: string }[];
  const pollByPost = new Map(polls.map(p => [p.post_id, p]));
  const pollIds = polls.map(p => p.id);
  const [{ data: optionRows }, { data: voteRows }] = pollIds.length > 0
    ? await Promise.all([
        supabase.from('post_poll_options').select('id, poll_id, label, position').in('poll_id', pollIds).order('position', { ascending: true }),
        supabase.from('post_poll_votes').select('poll_id, option_id, profile_id').in('poll_id', pollIds),
      ])
    : [{ data: [] as PollOptionRow[] }, { data: [] as { poll_id: string; option_id: string; profile_id: string }[] }];

  const optionsByPoll = new Map<string, PollOptionRow[]>();
  for (const o of (optionRows ?? []) as PollOptionRow[]) {
    const arr = optionsByPoll.get(o.poll_id) ?? [];
    arr.push(o);
    optionsByPoll.set(o.poll_id, arr);
  }
  const voteCountByOption = new Map<string, number>();
  const myVoteByPoll = new Map<string, string>();
  for (const v of (voteRows ?? []) as { poll_id: string; option_id: string; profile_id: string }[]) {
    voteCountByOption.set(v.option_id, (voteCountByOption.get(v.option_id) ?? 0) + 1);
    if (currentUserId && v.profile_id === currentUserId) myVoteByPoll.set(v.poll_id, v.option_id);
  }

  return posts.map(p => {
    const pollRow = pollByPost.get(p.id);
    const options = pollRow ? (optionsByPoll.get(pollRow.id) ?? []).map(o => ({ id: o.id, label: o.label, voteCount: voteCountByOption.get(o.id) ?? 0 })) : [];
    return {
      ...p,
      shared_post: p.shared_post_id ? (sharedPostById.get(p.shared_post_id) ?? null) : null,
      likeCount: likeCountByPost.get(p.id) ?? 0,
      likedByMe: likedByMe.has(p.id),
      commentCount: commentCountByPost.get(p.id) ?? 0,
      savedByMe: savedByMe.has(p.id),
      sampleLikers: sampleLikersByPost.get(p.id) ?? [],
      poll: pollRow ? {
        id: pollRow.id,
        question: pollRow.question,
        options,
        totalVotes: options.reduce((sum, o) => sum + o.voteCount, 0),
        myVoteOptionId: myVoteByPoll.get(pollRow.id) ?? null,
      } : null,
    };
  });
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
// Con tag → todos los posts (de cualquiera) que mencionan ese hashtag,
// para la página de tendencia/etiqueta — combinación aparte porque no
// comparte forma de query con el resto (no hay WHERE posible sin una
// columna de tags propia, ver /api/posts/trending-tags).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const authorHandle = searchParams.get('authorHandle');
  const before = searchParams.get('before');
  const scope = searchParams.get('scope'); // 'following' | 'collaborations' | 'saved' | null
  const sort = searchParams.get('sort'); // 'top' | null (default: más recientes primero)
  const tag = searchParams.get('tag');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (tag) {
    const { data, error } = await supabase
      .from('posts')
      .select(AUTHOR_SELECT)
      .order('created_at', { ascending: false })
      .limit(TAG_SEARCH_WINDOW);
    if (error) return NextResponse.json({ posts: [], hasMore: false });
    const norm = tag.toLowerCase();
    const matches = (data ?? []).filter((p: { body: string }) => extractHashtags(p.body).some(t => t.toLowerCase() === norm));
    const withCountsRows = await withCounts(supabase, matches, user?.id);
    return NextResponse.json({ posts: withCountsRows.slice(0, PAGE_SIZE), hasMore: withCountsRows.length > PAGE_SIZE });
  }

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

const pollSchema = z.object({
  question: z.string().min(1).max(200),
  options: z.array(z.string().min(1).max(80)).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS),
});

const postSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).optional(),
  sharedPostId: uuidSchema.optional(),
  imageUrl: z.url().max(1000).optional(),
  sharedProjectId: uuidSchema.optional(),
  sharedProjectKind: z.enum(['project', 'tour']).optional(),
  poll: pollSchema.optional(),
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
  // Un repost, una encuesta o un proyecto adjuntado pueden ir sin
  // comentario propio (el adjunto ya es el contenido) — un post de solo
  // texto, en cambio, sí lo necesita.
  if (!text && !sharedPostId && !body.poll && !body.sharedProjectId) {
    return NextResponse.json({ error: 'Falta el texto del post' }, { status: 400 });
  }

  // Un post admite un solo tipo de adjunto — el composer solo ofrece uno
  // por vez, esto es el resguardo del lado del servidor.
  const attachmentCount = [body.imageUrl, body.sharedProjectId, body.poll].filter(Boolean).length;
  if (attachmentCount > 1) {
    return NextResponse.json({ error: 'Un post admite un solo adjunto: imagen, proyecto o encuesta.' }, { status: 400 });
  }

  let sharedProjectKind: 'project' | 'tour' | null = null;
  if (body.sharedProjectId) {
    const { data: project } = await supabase.from('projects').select('id, owner_id, common_areas_tour').eq('id', body.sharedProjectId).maybeSingle();
    if (!project || project.owner_id !== user.id) {
      return NextResponse.json({ error: 'No podés adjuntar ese proyecto.' }, { status: 403 });
    }
    sharedProjectKind = body.sharedProjectKind ?? 'project';
    if (sharedProjectKind === 'tour' && !project.common_areas_tour) {
      return NextResponse.json({ error: 'Ese proyecto todavía no tiene un recorrido 360 cargado.' }, { status: 400 });
    }
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
    .insert({
      author_id: user.id,
      body: text,
      image_url: body.imageUrl || null,
      shared_post_id: sharedPostId,
      shared_project_id: body.sharedProjectId ?? null,
      shared_project_kind: sharedProjectKind,
    })
    .select(AUTHOR_SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.poll) {
    const { data: poll } = await supabase.from('post_polls').insert({ post_id: data.id, question: sanitizeText(body.poll.question, 200) }).select('id').single();
    if (poll) {
      await supabase.from('post_poll_options').insert(
        body.poll.options.map((label, i) => ({ poll_id: poll.id, label: sanitizeText(label, 80), position: i }))
      );
    }
  }

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
