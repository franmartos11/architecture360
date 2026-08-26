import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromCollaborator } from '@/lib/supabase/require-project-access';
import { sanitizeText } from '@/lib/sanitize';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromCollaborator(id);
  if (!projectId) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.contribution !== undefined) {
    updates.contribution = sanitizeText(body.contribution, 300);
    // Si ya lo había confirmado, cambiarle el texto sin que se entere sería
    // dejar acreditado en público algo que nunca aceptó — vuelve a pending
    // para que lo reconfirme.
    const { data: current } = await supabase.from('project_collaborators').select('status').eq('id', id).maybeSingle();
    if (current?.status === 'accepted') updates.status = 'pending';
  }

  const { data, error } = await supabase
    .from('project_collaborators')
    .update(updates)
    .eq('id', id)
    .select('*, profile:profiles(handle, display_name, avatar_image)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromCollaborator(id);
  if (!projectId) return NextResponse.json({ error: 'Colaborador no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { error } = await supabase.from('project_collaborators').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
