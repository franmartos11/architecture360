import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromMember } from '@/lib/supabase/require-project-access';
import { canManageMember } from '@/lib/project-roles';
import { parseJsonBody } from '@/lib/api-validate';
import { z } from 'zod';

const bodySchema = z.object({
  role: z.enum(['editor', 'gestor', 'administrador'], { message: 'Rol inválido' }),
});

const MEMBER_SELECT = '*, profile:profiles(handle, display_name, avatar_image)';

// Cambiar el rol de un miembro. Hay que poder gestionar tanto el rol que
// tiene como el que se le quiere dar: si no, un administrador podría
// ascender a alguien a administrador, o tocar a otro administrador.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromMember(id);
  if (!projectId) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, role: actorRole } = access;

  const parsed = await parseJsonBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { data: current } = await supabase.from('project_members').select('role').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
  if (!canManageMember(actorRole, current.role) || !canManageMember(actorRole, body.role)) {
    return NextResponse.json({ error: 'No podés asignar ese rol' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('project_members')
    .update({ role: body.role, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'No podés asignar ese rol' }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromMember(id);
  if (!projectId) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, role: actorRole } = access;

  const { data: current } = await supabase.from('project_members').select('role').eq('id', id).maybeSingle();
  if (!current) return NextResponse.json({ error: 'Miembro no encontrado' }, { status: 404 });
  if (!canManageMember(actorRole, current.role)) {
    return NextResponse.json({ error: 'No podés quitar a este miembro' }, { status: 403 });
  }

  const { error } = await supabase.from('project_members').delete().eq('id', id);
  if (error) {
    if (error.code === '42501') return NextResponse.json({ error: 'No podés quitar a este miembro' }, { status: 403 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
