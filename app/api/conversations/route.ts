import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { HANDLE_RE } from '@/lib/validate';
import { isBlockedEitherWay } from '@/lib/blocks';

const PARTICIPANT_SELECT = 'id, handle, display_name, avatar_image';

// GET /api/conversations → mis conversaciones, más reciente primero, con
// el otro participante, el último mensaje y el conteo de no leídos de
// cada una — todo en un puñado de queries batch en vez de N+1 por fila.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ conversations: [] });

  const { data, error } = await supabase
    .from('conversations')
    .select(`
      id, participant_one, participant_two, last_message_at, last_message_body, last_message_sender_id,
      one:profiles!conversations_participant_one_fkey(${PARTICIPANT_SELECT}),
      two:profiles!conversations_participant_two_fkey(${PARTICIPANT_SELECT})
    `)
    .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`)
    .order('last_message_at', { ascending: false });

  if (error) return NextResponse.json({ conversations: [] });

  const rows = (data ?? []) as unknown as {
    id: string; participant_one: string; participant_two: string; last_message_at: string;
    last_message_body: string | null; last_message_sender_id: string | null;
    one: { id: string; handle: string; display_name: string; avatar_image: string | null } | null;
    two: { id: string; handle: string; display_name: string; avatar_image: string | null } | null;
  }[];
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return NextResponse.json({ conversations: [] });

  // El último mensaje ya viene en la propia fila de conversations
  // (last_message_body/last_message_sender_id, ver POST de
  // .../messages) — no hace falta traer mensajes acá, solo el conteo de
  // no leídos, acotado a las conversaciones de este usuario.
  const { data: unreadRows } = await supabase
    .from('messages')
    .select('conversation_id')
    .in('conversation_id', ids)
    .is('read_at', null)
    .neq('sender_id', user.id);

  const unreadCountByConversation = new Map<string, number>();
  for (const m of (unreadRows ?? [])) {
    unreadCountByConversation.set(m.conversation_id, (unreadCountByConversation.get(m.conversation_id) ?? 0) + 1);
  }

  const conversations = rows.map(r => ({
    id: r.id,
    other: r.participant_one === user.id ? r.two : r.one,
    lastMessage: r.last_message_body !== null
      ? { body: r.last_message_body, sender_id: r.last_message_sender_id, created_at: r.last_message_at }
      : null,
    unreadCount: unreadCountByConversation.get(r.id) ?? 0,
    lastMessageAt: r.last_message_at,
  }));

  return NextResponse.json({ conversations });
}

// POST /api/conversations { handle } → obtiene o crea la conversación con
// ese perfil, idempotente (mismo criterio que el insert de follows).
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const handle = typeof body.handle === 'string' ? body.handle.trim().toLowerCase() : '';
  if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: 'Handle inválido' }, { status: 400 });

  const limited = await rateLimitOrRespond({ key: `conversations:user:${user.id}`, windowSeconds: 60, max: 20 });
  if (limited) return limited;

  const { data: me } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!me) return NextResponse.json({ error: 'Creá tu portfolio antes de mandar mensajes.' }, { status: 400 });

  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  if (target.id === me.id) return NextResponse.json({ error: 'No podés mandarte un mensaje a vos mismo.' }, { status: 400 });

  if (await isBlockedEitherWay(supabase, me.id, target.id)) {
    return NextResponse.json({ error: 'No podés iniciar una conversación con este perfil.' }, { status: 403 });
  }

  const [participantOne, participantTwo] = [me.id, target.id].sort();

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('participant_one', participantOne)
    .eq('participant_two', participantTwo)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id });

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ participant_one: participantOne, participant_two: participantTwo })
    .select('id')
    .single();

  if (error) {
    // 23505 = alguien ganó la carrera y ya la creó — buscarla de nuevo en vez de fallar.
    if (error.code === '23505') {
      const { data: raceWinner } = await supabase
        .from('conversations').select('id')
        .eq('participant_one', participantOne).eq('participant_two', participantTwo).maybeSingle();
      if (raceWinner) return NextResponse.json({ id: raceWinner.id });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ id: created.id }, { status: 201 });
}
