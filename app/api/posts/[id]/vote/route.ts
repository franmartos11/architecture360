import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Conteo actualizado de una encuesta tras votar/retirar el voto — el
// cliente ya tiene las opciones (label) de la respuesta original de
// GET /api/posts, así que acá solo hace falta lo que cambió.
async function getPollTally(supabase: SupabaseServerClient, pollId: string, userId: string) {
  const { data: votes } = await supabase.from('post_poll_votes').select('option_id, profile_id').eq('poll_id', pollId);
  const counts: Record<string, number> = {};
  let myVoteOptionId: string | null = null;
  for (const v of (votes ?? []) as { option_id: string; profile_id: string }[]) {
    counts[v.option_id] = (counts[v.option_id] ?? 0) + 1;
    if (v.profile_id === userId) myVoteOptionId = v.option_id;
  }
  return { counts, myVoteOptionId, totalVotes: (votes ?? []).length };
}

const voteSchema = z.object({ optionId: uuidSchema });

// Votar de nuevo reemplaza el voto anterior (upsert por poll_id+profile_id)
// en vez de acumular — una encuesta es de una sola elección.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = await parseJsonBody(request, voteSchema);
  if ('error' in parsed) return parsed.error;

  const { data: poll } = await supabase.from('post_polls').select('id').eq('post_id', id).maybeSingle();
  if (!poll) return NextResponse.json({ error: 'Esta publicación no tiene una encuesta.' }, { status: 404 });

  const { data: option } = await supabase.from('post_poll_options').select('id').eq('id', parsed.data.optionId).eq('poll_id', poll.id).maybeSingle();
  if (!option) return NextResponse.json({ error: 'Opción inválida.' }, { status: 400 });

  const { error } = await supabase
    .from('post_poll_votes')
    .upsert({ poll_id: poll.id, option_id: option.id, profile_id: user.id }, { onConflict: 'poll_id,profile_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await getPollTally(supabase, poll.id, user.id));
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: poll } = await supabase.from('post_polls').select('id').eq('post_id', id).maybeSingle();
  if (!poll) return NextResponse.json({ error: 'Esta publicación no tiene una encuesta.' }, { status: 404 });

  const { error } = await supabase.from('post_poll_votes').delete().eq('poll_id', poll.id).eq('profile_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(await getPollTally(supabase, poll.id, user.id));
}
