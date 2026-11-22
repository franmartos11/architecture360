import { NextResponse } from 'next/server';
import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { aerialSlideCreateSchema } from '@/lib/content-schemas';

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.imageUrl || !raw.data.label || typeof raw.data.label !== 'string') {
    return NextResponse.json({ error: 'Faltan imageUrl y/o label' }, { status: 400 });
  }
  const parsed = validateJson(raw.data, aerialSlideCreateSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { data, error } = await supabase
    .from('aerial_slides')
    .insert({
      project_id: projectId,
      image_url: body.imageUrl,
      video_url: body.videoUrl || null,
      label: sanitizeText(body.label, 150),
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
