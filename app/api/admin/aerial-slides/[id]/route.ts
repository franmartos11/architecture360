import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromSlide } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromSlide(id);
  if (!projectId) return NextResponse.json({ error: 'Vista aérea no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;
  if (body.videoUrl !== undefined) updates.video_url = body.videoUrl || null;
  if (body.label !== undefined) updates.label = sanitizeText(body.label, 150);
  if (body.sortOrder !== undefined) updates.sort_order = body.sortOrder;

  const { data, error } = await supabase.from('aerial_slides').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromSlide(id);
  if (!projectId) return NextResponse.json({ error: 'Vista aérea no encontrada' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // Cascade se lleva los hotspots de este slide.
  const { error } = await supabase.from('aerial_slides').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
