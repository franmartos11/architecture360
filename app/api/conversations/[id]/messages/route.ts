import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline } from '@/lib/sanitize';

const PAGE_SIZE = 30;
const MAX_BODY_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_MESSAGES = 30;
const ATTACHMENT_TYPES = ['image', 'audio', 'file'] as const;

const messageSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).optional(),
  sharedPostId: uuidSchema.optional(),
  attachmentUrl: z.url().max(1000).optional(),
  attachmentType: z.enum(ATTACHMENT_TYPES).optional(),
});

const SHARED_POST_SELECT = 'id, body, image_url, created_at, author:profiles(handle, display_name, avatar_image)';
const MESSAGE_SELECT = `*, shared_post:posts(${SHARED_POST_SELECT})`;

async function getConversationIfParticipant(supabase: Awaited<ReturnType<typeof createClient>>, id: string, userId: string) {
  const { data } = await supabase.from('conversations').select('id, participant_one, participant_two').eq('id', id).maybeSingle();
  if (!data) return null;
  if (data.participant_one !== userId && data.participant_two !== userId) return null;
  return data;
}

// GET /api/conversations/[id]/messages?before= → paginado por cursor,
// mismo patrón que /api/comments. Degrada a lista vacía si la
// conversación no existe o no participás — no expone si existe o no.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const before = searchParams.get('before');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ messages: [], hasMore: false });

  const conversation = await getConversationIfParticipant(supabase, id, user.id);
  if (!conversation) return NextResponse.json({ messages: [], hasMore: false });

  let query = supabase
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ messages: [], hasMore: false });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);
  return NextResponse.json({ messages: page, hasMore });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const conversation = await getConversationIfParticipant(supabase, id, user.id);
  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  const parsed = await parseJsonBody(request, messageSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const text = sanitizeMultiline(body.body, MAX_BODY_LENGTH);
  const sharedPostId = body.sharedPostId ?? null;
  const attachmentUrl = body.attachmentUrl ?? null;
  const attachmentType = body.attachmentType ?? null;
  // Un mensaje puede ser solo un post compartido o solo un adjunto, sin texto propio.
  if (!text && !sharedPostId && !attachmentUrl) return NextResponse.json({ error: 'Falta el texto del mensaje' }, { status: 400 });

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('sender_id', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_MESSAGES) {
    return NextResponse.json({ error: 'Estás mandando mensajes muy rápido — esperá un momento.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: id, sender_id: user.id, body: text || null, shared_post_id: sharedPostId,
      attachment_url: attachmentUrl, attachment_type: attachmentUrl ? attachmentType : null,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', id);

  const recipientId = conversation.participant_one === user.id ? conversation.participant_two : conversation.participant_one;
  await notify(supabase, { recipientId, actorId: user.id, type: 'message', entityId: id });

  return NextResponse.json(data, { status: 201 });
}
