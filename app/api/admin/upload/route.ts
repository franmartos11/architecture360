import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const folder = (formData.get('folder') as string | null) ?? 'general';

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  }

  // MediaRecorder entrega el mimeType con el codec pegado (ej.
  // "audio/webm;codecs=opus") — se compara solo la parte de antes del
  // ';', si no ningún audio grabado en el navegador matchea la lista.
  const baseType = file.type.split(';')[0].trim();
  const isVideo = ALLOWED_VIDEO_TYPES.includes(baseType);
  const isImage = ALLOWED_IMAGE_TYPES.includes(baseType);
  const isAudio = ALLOWED_AUDIO_TYPES.includes(baseType);
  const isDocument = ALLOWED_DOCUMENT_TYPES.includes(baseType);
  if (!isVideo && !isImage && !isAudio && !isDocument) {
    return NextResponse.json({ error: `Tipo de archivo no permitido: ${file.type}` }, { status: 400 });
  }
  const maxSize = isVideo ? MAX_VIDEO_SIZE : isAudio ? MAX_AUDIO_SIZE : isDocument ? MAX_DOCUMENT_SIZE : MAX_IMAGE_SIZE;
  if (file.size > maxSize) {
    return NextResponse.json({ error: `El archivo pesa más de ${maxSize / (1024 * 1024)}MB` }, { status: 400 });
  }

  const safeFolder = folder.replace(/[^a-z0-9-]/gi, '-');
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const admin = createAdminClient();
  const bytes = await file.arrayBuffer();
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: baseType,
    upsert: false,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl, path });
}
