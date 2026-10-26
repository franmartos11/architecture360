import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { parseJsonBody } from '@/lib/api-validate';
import { uploadTicketSchema } from '@/lib/signed-upload-schema';

const MAX_IMAGE_SIZE = 15 * 1024 * 1024; // 15MB — las panorámicas 360° pesan bastante
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB — clips cortos en loop, no hay que subir un documental
const MAX_AUDIO_SIZE = 20 * 1024 * 1024; // 20MB — de sobra para una nota de voz de varios minutos
const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
// audio/webm es lo que graba MediaRecorder en Chrome/Firefox; audio/mp4
// es lo que graba Safari — ver el grabador de notas de voz en mensajes.
const ALLOWED_AUDIO_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg', 'audio/wav'];
const ALLOWED_DOCUMENT_TYPES = ['application/pdf'];
const BUCKET = 'project-media';

// POST /api/admin/upload → NO recibe el archivo: recibe sus datos
// (nombre, tipo, peso), los valida y devuelve una URL firmada para que el
// navegador lo suba directo a Supabase (ver lib/signed-upload.ts). Antes
// el archivo pasaba por acá, pero Vercel corta cualquier body de más de
// 4,5MB con un 413 antes de llegar a la función — una foto 4K ya no
// entraba, y los topes de abajo (15MB, 100MB) eran letra muerta.
export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond(
    { key: `upload:user:${user.id}`, windowSeconds: 60, max: 60 },
    'Estás subiendo archivos muy rápido — esperá un momento.'
  );
  if (limited) return limited;

  const parsed = await parseJsonBody(request, uploadTicketSchema);
  if ('error' in parsed) return parsed.error;
  const { name, type, size, folder = 'general' } = parsed.data;

  // MediaRecorder entrega el mimeType con el codec pegado (ej.
  // "audio/webm;codecs=opus") — se compara solo la parte de antes del
  // ';', si no ningún audio grabado en el navegador matchea la lista.
  const baseType = type.split(';')[0].trim();
  const isVideo = ALLOWED_VIDEO_TYPES.includes(baseType);
  const isImage = ALLOWED_IMAGE_TYPES.includes(baseType);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(baseType);
  const isDocument = ALLOWED_DOCUMENT_TYPES.includes(baseType);
  if (!isVideo && !isImage && !isAudio && !isDocument) {
    return NextResponse.json({ error: `Tipo de archivo no permitido: ${type}` }, { status: 400 });
  }
  const maxSize = isVideo ? MAX_VIDEO_SIZE : isAudio ? MAX_AUDIO_SIZE : isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
  if (size > maxSize) {
    return NextResponse.json({ error: `El archivo pesa más de ${maxSize / (1024 * 1024)}MB` }, { status: 400 });
  }

  const safeFolder = folder.replace(/[^a-z0-9-]/gi, '-');
  const ext = name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !signed) return NextResponse.json({ error: error?.message ?? 'No se pudo preparar la subida' }, { status: 500 });

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ signedUrl: signed.signedUrl, contentType: baseType, url: data.publicUrl, path });
}
