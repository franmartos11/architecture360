import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { ROLE_LABELS, type MemberRole } from '@/lib/project-roles';
import { parseJsonBody } from '@/lib/api-validate';
import { z } from 'zod';
import { planMemberInvite } from '@/lib/member-invite';
import { escapeHtml } from '@/lib/sanitize';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { serverError } from '@/lib/api-errors';

const bodySchema = z.object({
  handle: z.string().min(1, 'Falta el handle de la persona'),
  role: z.enum(['editor', 'gestor', 'administrador'], { message: 'Rol inválido' }),
});

const MEMBER_SELECT = '*, profile:profiles(handle, display_name, avatar_image)';

async function notifyInvitee(
  { profileId, actorId, projectId, projectName, role }: { profileId: string; actorId: string; projectId: string; projectName: string; role: MemberRole },
) {
  // Dos canales, cada uno best-effort por separado — que falle el mail no
  // debe tapar la notificación in-app, ni al revés.
  await notify({ recipientId: profileId, actorId, type: 'project_invite', entityId: projectId });
  try {
    const { data: { user: invitee } } = await createAdminClient().auth.admin.getUserById(profileId);
    if (!invitee?.email) return;
    await sendEmail({
      to: invitee.email,
      subject: `Te invitaron a editar "${projectName}"`,
      html: `<p>Te invitaron a sumarte a <strong>${escapeHtml(projectName)}</strong> como ${ROLE_LABELS[role]}.</p>
        <p>Entrá a tus proyectos (/admin/proyectos) para aceptar o rechazar la invitación.</p>`,
    });
  } catch (err) {
    console.error('[members] no se pudo notificar a la persona invitada', err);
  }
}

// Equipo del proyecto: la persona dueña (que no tiene fila en
// project_members) más los miembros, con su rol y estado.
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { minRole: 'editor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, role } = access;

  const { data: project } = await supabase.from('projects').select('owner_id').eq('id', projectId).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const [{ data: owner }, { data: members, error }] = await Promise.all([
    supabase.from('profiles').select('id, handle, display_name, avatar_image').eq('id', project.owner_id).maybeSingle(),
    supabase.from('project_members').select(MEMBER_SELECT).eq('project_id', projectId).order('created_at', { ascending: true }),
  ]);
  if (error) return serverError(error);

  return NextResponse.json({ owner, members: members ?? [], myRole: role });
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const parsed = await parseJsonBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const memberRole: MemberRole = body.role;

  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user, role: actorRole } = access;

  const { data: profile } = await supabase.from('profiles').select('id').eq('handle', body.handle).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No existe ningún perfil con ese handle' }, { status: 404 });

  const [{ data: project }, { data: existing }] = await Promise.all([
    supabase.from('projects').select('name, owner_id').eq('id', projectId).maybeSingle(),
    supabase.from('project_members').select('id, status').eq('project_id', projectId).eq('user_id', profile.id).maybeSingle(),
  ]);
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const plan = planMemberInvite({ actorRole, role: memberRole, targetId: profile.id, ownerId: project.owner_id, existing });
  if ('error' in plan) return NextResponse.json({ error: plan.error }, { status: plan.status });

  // El límite corre antes de ambos caminos (invitación nueva y reinvitación).
  // Atómico en Postgres (check_rate_limit): contar filas y después escribir
  // dejaba pasar varios pedidos simultáneos por debajo del tope.
  const limited = await rateLimitOrRespond(
    { key: `members-invite:user:${user.id}`, windowSeconds: 600, max: 10 },
    'Mandaste muchas invitaciones seguidas — esperá unos minutos.',
  );
  if (limited) return limited;

  if (plan.action === 'reinvite') {
    // Un solo update: el trigger de la base permite, en una fila ajena, pasar
    // a 'pending' junto con el rol nuevo, y pone invited_by := quien llama.
    // Dos updates dejarían una invitación pendiente con el rol viejo si el
    // segundo falla.
    const { data, error } = await supabase
      .from('project_members')
      .update({ status: 'pending', role: memberRole, updated_at: new Date().toISOString() })
      .eq('id', plan.id)
      .select(MEMBER_SELECT)
      .single();
    if (error) {
      // 42501: el trigger rechazó la reinvitación (p. ej. la fila rechazada
      // tenía un rol que quien invita no puede gestionar).
      if (error.code === '42501') return NextResponse.json({ error: 'No podés invitar a esa persona' }, { status: 403 });
      return serverError(error);
    }
    await notifyInvitee({ profileId: profile.id, actorId: user.id, projectId, projectName: project.name, role: memberRole });
    return NextResponse.json(data, { status: 201 });
  }

  const { data, error } = await supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: profile.id, role: memberRole, invited_by: user.id })
    .select(MEMBER_SELECT)
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Esa persona ya fue invitada a este proyecto.' }, { status: 409 });
    if (error.code === '42501') return NextResponse.json({ error: 'No podés invitar a esa persona' }, { status: 403 });
    return serverError(error);
  }
  await notifyInvitee({ profileId: profile.id, actorId: user.id, projectId, projectName: project.name, role: memberRole });
  return NextResponse.json(data, { status: 201 });
}
