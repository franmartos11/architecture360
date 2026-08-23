import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;
const MAX_BODY_LENGTH = 2000;
// Sin infraestructura de rate-limit dedicada — alcanza con contar contra
// la propia tabla, dado el volumen esperado de esta app.
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_COMMENTS = 5;

// No hay una relación de foreign key entre project_comments.author_id y
// profiles (profiles es opt-in — no todo el que comenta tiene uno), así
// que PostgREST no puede embeber el perfil solo; se arman a mano acá,
// igual que el resto de los joins manuales de este proyecto.
async function withAuthors(
  supabase: Awaited<ReturnType<typeof createClient>>,
  comments: { id: string; project_id: string; author_id: string; body: string; created_at: string }[]
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
  const projectId = searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'Falta projectId' }, { status: 400 });
  const before = searchParams.get('before');

  const supabase = await createClient();
  let query = supabase
    .from('project_comments')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ comments: await withAuthors(supabase, page), hasMore });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!body.projectId || !text) return NextResponse.json({ error: 'Falta projectId y/o body' }, { status: 400 });
  if (text.length > MAX_BODY_LENGTH) {
    return NextResponse.json({ error: `El comentario no puede superar los ${MAX_BODY_LENGTH} caracteres.` }, { status: 400 });
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('project_comments')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_COMMENTS) {
    return NextResponse.json({ error: 'Estás comentando muy rápido — esperá unos minutos.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('project_comments')
    .insert({ project_id: body.projectId, author_id: user.id, body: text })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const [comment] = await withAuthors(supabase, [data]);
  return NextResponse.json(comment, { status: 201 });
}
