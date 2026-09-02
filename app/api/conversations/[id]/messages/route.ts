import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notify } from '@/lib/notify';
import { parseJsonBody, uuidSchema } from '@/lib/api-validate';
import { sanitizeMultiline } from '@/lib/sanitize';
import { isBlockedEitherWay } from '@/lib/blocks';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { getConversationIfParticipant } from '@/lib/conversations';

const PAGE_SIZE = 30;
const MAX_BODY_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_MESSAGES = 30;
const ATTACHMENT_TYPES = ['image', 'audio', 'file'] as const;
const ATTACHMENT_BUCKET = 'message-attachments';
// Corta a propósito — una URL firmada vieja quedando dando vueltas en el
// historial de mensajes no debería servir para siempre; 10 minutos alcanza
// de sobra para ver/reproducir en el momento en que se carga el hilo, y se
// re-firma solo con volver a pedir la página.
const ATTACHMENT_SIGN_EXPIRES_SECONDS = 10 * 60;

const messageSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).optional(),
  sharedPostId: uuidSchema.optional(),
  // Path devuelto por POST /api/conversations/[id]/attachments, no una URL
  // — el bucket message-attachments es privado, así que nunca hay una URL
  // pública que un cliente pueda mandar directo (ver resolveAttachmentUrls).
  attachmentPath: z.string().min(1).max(300).optional(),
  attachmentType: z.enum(ATTACHMENT_TYPES).optional(),
});

const SHARED_POST_SELECT = 'id, body, image_url, created_at, author:profiles(handle, display_name, avatar_image)';
const MESSAGE_SELECT = `*, shared_post:posts(${SHARED_POST_SELECT})`;

interface MessageRow {
  attachment_url: string | null;
  [key: string]: unknown;
}

// El bucket es privado — nunca se guarda ni se sirve una URL pública de
// adjunto. attachment_url en la fila guarda la PATH interna (ver POST de
// abajo); acá se resuelve a una URL firmada de corta duración recién al
// listar, con la service_role key (createSignedUrl no depende de policies
// de storage.objects — el chequeo de "sos participante" ya lo hizo
// getConversationIfParticipant más arriba en la ruta).
// Mensajes viejos (de antes de este cambio) guardan una URL pública
// completa del bucket público anterior — esas pasan tal cual, nunca
// empiezan con "http" las paths nuevas.
async function resolveAttachmentUrls<T extends MessageRow>(messages: T[]): Promise<T[]> {
  const paths = messages.map(m => m.attachment_url).filter((u): u is string => !!u && !u.startsWith('http'));
  if (paths.length === 0) return messages;

  const admin = createAdminClient();
  const { data: signed } = await admin.storage.from(ATTACHMENT_BUCKET).createSignedUrls(paths, ATTACHMENT_SIGN_EXPIRES_SECONDS);
  const signedByPath = new Map((signed ?? []).map(s => [s.path, s.signedUrl]));

  return messages.map(m => {
    if (!m.attachment_url || m.attachment_url.startsWith('http')) return m;
    return { ...m, attachment_url: signedByPath.get(m.attachment_url) ?? null };
  });
}

const ATTACHMENT_PREVIEW: Record<(typeof ATTACHMENT_TYPES)[number], string> = {
  image: '📷 Foto',
  audio: '🎙️ Nota de voz',
  file: '📎 Archivo',
};

// Texto corto para conversations.last_message_body — un mensaje puede no
// tener body propio (solo adjunto o post compartido, ver comentarios en
// supabase/schema.sql), así que la lista de conversaciones necesita algo
// para mostrar igual. Mismo criterio que usa el backfill de la migración.
function messagePreview(text: string | null, attachmentType: string | null, sharedPostId: string | null): string {
  if (text) return text;
  if (attachmentType && attachmentType in ATTACHMENT_PREVIEW) return ATTACHMENT_PREVIEW[attachmentType as (typeof ATTACHMENT_TYPES)[number]];
  if (sharedPostId) return '🔗 Publicación compartida';
  return '';
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
  const page = await resolveAttachmentUrls(rows.slice(0, PAGE_SIZE) as unknown as MessageRow[]);
  return NextResponse.json({ messages: page, hasMore });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const conversation = await getConversationIfParticipant(supabase, id, user.id);
  if (!conversation) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  const recipientId = conversation.participant_one === user.id ? conversation.participant_two : conversation.participant_one;
  if (await isBlockedEitherWay(supabase, user.id, recipientId)) {
    return NextResponse.json({ error: 'No podés mandar mensajes en esta conversación.' }, { status: 403 });
  }

  const parsed = await parseJsonBody(request, messageSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const text = sanitizeMultiline(body.body, MAX_BODY_LENGTH);
  const sharedPostId = body.sharedPostId ?? null;
  const attachmentPath = body.attachmentPath ?? null;
  const attachmentType = body.attachmentType ?? null;
  // Un mensaje puede ser solo un post compartido o solo un adjunto, sin texto propio.
  if (!text && !sharedPostId && !attachmentPath) return NextResponse.json({ error: 'Falta el texto del mensaje' }, { status: 400 });
  // El upload (POST .../attachments) guarda cada adjunto bajo "<conversationId>/..."
  // — que la path venga con ese prefijo evita que alguien mande el path de un
  // archivo subido a OTRA conversación (uno propio, de otro hilo) y lo cuele acá.
  if (attachmentPath && !attachmentPath.startsWith(`${id}/`)) {
    return NextResponse.json({ error: 'Adjunto inválido' }, { status: 400 });
  }

  const limited = await rateLimitOrRespond(
    { key: `messages:user:${user.id}`, windowSeconds: RATE_LIMIT_WINDOW_MINUTES * 60, max: RATE_LIMIT_MAX_MESSAGES },
    'Estás mandando mensajes muy rápido — esperá un momento.'
  );
  if (limited) return limited;

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: id, sender_id: user.id, body: text || null, shared_post_id: sharedPostId,
      attachment_url: attachmentPath, attachment_type: attachmentPath ? attachmentType : null,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [resolved] = await resolveAttachmentUrls([data as unknown as MessageRow]);

  await supabase.from('conversations').update({
    last_message_at: new Date().toISOString(),
    last_message_body: messagePreview(text, attachmentType, sharedPostId),
    last_message_sender_id: user.id,
  }).eq('id', id);

  await notify(supabase, { recipientId, actorId: user.id, type: 'message', entityId: id });

  return NextResponse.json(resolved, { status: 201 });
}
