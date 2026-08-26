import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromFloor } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromFloor(id);
  if (!projectId) return NextResponse.json({ error: 'Piso no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.number !== undefined) updates.number = body.number;
  if (body.label !== undefined) updates.label = sanitizeText(body.label, 100);
  if (body.planImage !== undefined) updates.plan_image = body.planImage;
  if (body.unitDots !== undefined) updates.unit_dots = body.unitDots;
  if (body.floorKind !== undefined) updates.floor_kind = body.floorKind;
  if (body.floorKindDescription !== undefined) updates.floor_kind_description = sanitizeText(body.floorKindDescription, 300) || null;

  const { data, error } = await supabase.from('floors').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromFloor(id);
  if (!projectId) return NextResponse.json({ error: 'Piso no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // Cascade se lleva las unidades de este piso.
  const { error } = await supabase.from('floors').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
