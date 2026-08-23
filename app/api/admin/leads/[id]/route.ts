import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromLead } from '@/lib/supabase/require-project-access';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromLead(id);
  if (!projectId) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;

  const { data, error } = await supabase.from('leads').update(updates).eq('id', id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
