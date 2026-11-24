import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { serverError } from '@/lib/api-errors';
import { getClaimsUser } from '@/lib/supabase/claims';

// Pendientes de la cuenta logueada: invitaciones a proyectos ajenos y
// transferencias de propiedad que le ofrecieron.
export async function GET() {
  const supabase = await createClient();
  const user = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const [{ data: members, error: membersError }, { data: transfers, error: transfersError }] = await Promise.all([
    supabase
      .from('project_members')
      .select('id, role, invited_by, project_id')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('project_ownership_transfers')
      .select('id, from_user, project_id')
      .eq('to_user', user.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
  ]);
  if (membersError) return serverError(membersError);
  if (transfersError) return serverError(transfersError);

  // Quien recibe una invitación todavía no tiene rol en el proyecto, así que
  // RLS no le deja leer un borrador: los nombres se leen con el cliente admin,
  // acotados a los proyectos de SUS filas pendientes.
  const projectIds = [...new Set([
    ...(members ?? []).map((m) => m.project_id as string),
    ...(transfers ?? []).map((t) => t.project_id as string),
  ].filter(Boolean))];
  const { data: projects } = projectIds.length
    ? await createAdminClient().from('projects').select('id, name, slug').in('id', projectIds)
    : { data: [] as { id: string; name: string; slug: string }[] };
  const projectById = new Map((projects ?? []).map((p) => [p.id, p]));

  // Un solo fetch de perfiles para quienes invitan y quienes transfieren.
  const personIds = [...new Set([
    ...(members ?? []).map((m) => m.invited_by as string),
    ...(transfers ?? []).map((t) => t.from_user as string),
  ].filter(Boolean))];
  const { data: profiles } = personIds.length
    ? await supabase.from('profiles').select('id, handle, display_name').in('id', personIds)
    : { data: [] as { id: string; handle: string; display_name: string }[] };
  const byId = new Map((profiles ?? []).map((p) => [p.id, { handle: p.handle, display_name: p.display_name }]));

  return NextResponse.json({
    invitations: (members ?? []).map((m) => {
      const p = projectById.get(m.project_id as string);
      return {
        id: m.id,
        role: m.role,
        project: p ? { id: p.id, name: p.name, slug: p.slug } : null,
        inviter: byId.get(m.invited_by as string) ?? null,
      };
    }),
    transfers: (transfers ?? []).map((t) => {
      const p = projectById.get(t.project_id as string);
      return {
        id: t.id,
        project: p ? { id: p.id, name: p.name } : null,
        from: byId.get(t.from_user as string) ?? null,
      };
    }),
  });
}
