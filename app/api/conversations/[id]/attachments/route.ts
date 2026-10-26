import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { isBlockedEitherWay } from '@/lib/blocks';
import { getConversationIfParticipant } from '@/lib/conversations';
import { parseJsonBody } from '@/lib/api-validate';
import { uploadTicketSchema } from '@/lib/signed-upload-schema';

const BUCKET = 'message-attachments';
const MAX_IMAGE_SIZE = 15 * 1024 * 1024;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
// audio/webm es lo que graba MediaRecorder en Chrome/Firefox; audio/mp4 es
// lo que graba Safari — ver el grabador de notas de voz en MessageThread.
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];

// POST /api/conversations/[id]/attachments → prepara la subida de un
// adjunto de DM al bucket privado message-attachments: valida nombre/tipo/
// peso y devuelve una URL firmada para que el navegador suba el archivo
// directo a Supabase (ver lib/signed-upload.ts — el archivo no pasa por
// acá porque Vercel corta los bodies de más de 4,5MB). Es distinto de
// /api/admin/upload (que va al bucket público project-media, para
// fotos/panorámicas de un proyecto). Devuelve la PATH interna, nunca una URL — un adjunto de
// mensaje privado no debería tener una URL pública dando vueltas para
// siempre; el hilo la resuelve a una URL firmada de corta duración recién
// al listar mensajes (ver GET .../messages).
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

  const limited = await rateLimitOrRespond(
    { key: `attachments:user:${user.id}`, windowSeconds: 60, max: 30 },
    'Estás subiendo archivos muy rápido — esperá un momento.'
  );
  if (limited) return limited;

  const parsed = await parseJsonBody(request, uploadTicketSchema);
  if ('error' in parsed) return parsed.error;
  const { name, type, size } = parsed.data;

  // MediaRecorder entrega el mimeType con el codec pegado (ej.
  // "audio/webm;codecs=opus") — se compara solo la parte de antes del ';'.
  const baseType = type.split(';')[0].trim();
  const isImage = ALLOWED_IMAGE_TYPES.includes(baseType);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(baseType);
  const isDocument = ALLOWED_DOCUMENT_TYPES.includes(baseType);
  if (!isImage && !isAudio && !isDocument) {
    return NextResponse.json({ error: `Tipo de archivo no permitido: ${type}` }, { status: 400 });
  }
  const maxSize = isAudio ? MAX_AUDIO_SIZE : isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
  if (size > maxSize) {
    return NextResponse.json({ error: `El archivo pesa más de ${maxSize / (1024 * 1024)}MB` }, { status: 400 });
  }

  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  // Prefijo por conversationId a propósito: POST .../messages valida que
  // la path que le llega empiece con "<id>/" antes de guardarla, así que
  // un adjunto subido acá solo puede usarse en ESTA conversación.
  const path = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'No se pudo preparar la subida' }, { status: 500 });

  const attachmentType = isImage ? 'image' : isAudio ? 'audio' : 'file';
  return NextResponse.json({ signedUrl: signed.signedUrl, contentType: baseType, path, attachmentType });
}
