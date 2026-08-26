import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeText } from '@/lib/sanitize';

// Fuentes propias — cuenta-scoped (owner_id), no project-scoped: se suben
// una vez y quedan disponibles para elegir en cualquier proyecto del mismo
// dueño (ver lib/resolve-theme.ts). Mismo bucket/patrón de subida que
// /api/admin/upload, pero con su propia tabla porque acá además del
// archivo hace falta un nombre y quién es el dueño.
const MAX_FONT_SIZE = 5 * 1024 * 1024; // 5MB — de sobra para un woff2/ttf de una sola variante
const ALLOWED_FONT_TYPES: Record<string, string> = {
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'application/font-woff': 'woff',
  'application/font-woff2': 'woff2',
  'application/x-font-ttf': 'ttf',
};
const BUCKET = 'project-media';

export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('fonts').select('*').eq('owner_id', user.id).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fonts: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file');
  const name = sanitizeText(formData.get('name'), 100);

  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta el archivo' }, { status: 400 });
  if (!name) return NextResponse.json({ error: 'Falta el nombre de la tipografía' }, { status: 400 });

  const format = ALLOWED_FONT_TYPES[file.type];
  if (!format) return NextResponse.json({ error: `Tipo de archivo no permitido: ${file.type}. Subí un .woff2, .woff, .ttf u .otf` }, { status: 400 });
  if (file.size > MAX_FONT_SIZE) return NextResponse.json({ error: `El archivo pesa más de ${MAX_FONT_SIZE / (1024 * 1024)}MB` }, { status: 400 });

  const path = `fonts/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${format}`;

  const admin = createAdminClient();
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrl } = admin.storage.from(BUCKET).getPublicUrl(path);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('fonts')
    .insert({ owner_id: user.id, name, file_url: publicUrl.publicUrl, format })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ font: data });
}
