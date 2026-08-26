import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline } from '@/lib/sanitize';

const PAGE_SIZE = 20;
const MAX_BODY_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_COMMENTS = 5;

// Mismo patrón que /api/comments (project_comments) — sin FK real entre
// post_comments.author_id y profiles, join manual.
async function withAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comments: { id: string; post_id: string; author_id: string; body: string; created_at: string }[]
) {
  const authorIds = [...new Set(comments.map(c => c.author_id))];
  const { data: profiles } = authorIds.length
    ? await supabase.from('profiles').select('id, handle, display_name, avatar_image').in('id', authorIds)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]));

  return comments.map(c => ({
    ...c,
    author: profileById.get(c.author_id) ?? null,
  }));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const postId = searchParams.get('postId');
  if (!postId) return NextResponse.json({ error: 'Falta postId' }, { status: 400 });
  const before = searchParams.get('before');

  const supabase = await createClient();
  let query = supabase
    .from('post_comments')
    .select('*')
    .eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ comments: [], hasMore: false });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ comments: await withAuthors(supabase, page), hasMore });
}

const postCommentSchema = z.object({
  postId: uuidSchema,
  body: z.string().trim().min(1, 'Falta el comentario').max(MAX_BODY_LENGTH),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = await parseJsonBody(request, postCommentSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const text = sanitizeMultiline(body.body, MAX_BODY_LENGTH);
  if (!text) return NextResponse.json({ error: 'Falta el comentario' }, { status: 400 });

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('post_comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_COMMENTS) {
    return NextResponse.json({ error: 'Estás comentando muy rápido — esperá unos minutos.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('post_comments')
    .insert({ post_id: body.postId, author_id: user.id, body: text })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: post } = await supabase.from('posts').select('author_id').eq('id', body.postId).maybeSingle();
  if (post) await notify(supabase, { recipientId: post.author_id, actorId: user.id, type: 'comment', entityId: body.postId });

  const [comment] = await withAuthors(supabase, [data]);
  return NextResponse.json(comment, { status: 201 });
}
