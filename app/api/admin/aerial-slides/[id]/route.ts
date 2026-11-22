import { NextResponse } from 'next/server';
import { resolveProjectIdFromSlide, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { aerialSlidePatchSchema } from '@/lib/content-schemas';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromSlide(id);
  if (!projectId) return NextResponse.json({ error: 'Vista aérea no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  const parsed = validateJson(raw.data, aerialSlidePatchSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const updates: Record<string, unknown> = {};
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
  if (body.videoUrl !== undefined) updates.video_url = body.videoUrl || null;
  if (body.label !== undefined) updates.label = sanitizeText(body.label, 150);
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

  const { data, error } = await supabase.from('aerial_slides').update(updates).eq('id', id).select().single();
  if (error) return serverError(error);
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromSlide(id);
  if (!projectId) return NextResponse.json({ error: 'Vista aérea no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // Cascade se lleva los hotspots de este slide.
  const { error } = await supabase.from('aerial_slides').delete().eq('id', id);
  if (error) return serverError(error);
  return NextResponse.json({ success: true });
}
