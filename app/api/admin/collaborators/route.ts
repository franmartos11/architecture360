import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_INVITES = 10;

async function notifyInvitee(profileId: string, projectName: string) {
  try {
    const { data: { user: invitee } } = await createAdminClient().auth.admin.getUserById(profileId);
    if (!invitee?.email) return;
    await sendEmail({
      to: invitee.email,
      subject: `Te acreditaron en "${projectName}"`,
      html: `<p>Te sumaron como colaborador en <strong>${projectName}</strong>.</p>
        <p>Entrá a tu portfolio (/admin/portfolio) para confirmar el crédito — recién ahí aparece en público.</p>`,
    });
  } catch (err) {
    console.error('[collaborators] no se pudo notificar a la persona acreditada', err);
  }
}

// El dueño del proyecto acredita a otra cuenta por su profiles.handle —
// nace "pending" y solo se vuelve público cuando esa persona lo acepta
// desde /admin/portfolio (ver /api/collaborators/[id]/respond).
export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const body = await request.json();
  if (!body.handle) return NextResponse.json({ error: 'Falta el handle de la persona' }, { status: 400 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const { data: profile } = await supabase.from('profiles').select('id').eq('handle', body.handle).maybeSingle();
  if (!profile) return NextResponse.json({ error: 'No existe ningún perfil con ese handle' }, { status: 404 });

  const { data: project } = await supabase.from('projects').select('name').eq('id', projectId).maybeSingle();

  // Si ya rechazó una invitación anterior a este mismo proyecto, no hay
  // forma de reinvitarla sin esto — el unique(project_id, profile_id) haría
  // que un insert nuevo choque siempre con un 409 fantasma.
  const { data: existing } = await supabase
    .from('project_collaborators')
    .select('id, status')
    .eq('project_id', projectId)
    .eq('profile_id', profile.id)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'declined') {
      const msg = existing.status === 'accepted' ? 'Esa persona ya está acreditada en este proyecto.' : 'Ya la invitaste — está pendiente de que la confirme.';
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    const { data, error } = await supabase
      .from('project_collaborators')
      .update({ status: 'pending', contribution: body.contribution ?? '', invited_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*, profile:profiles(handle, display_name, avatar_image)')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (project?.name) await notifyInvitee(profile.id, project.name);
    return NextResponse.json(data, { status: 201 });
  }

  const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('project_collaborators')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', since);
  if ((recentCount ?? 0) >= RATE_LIMIT_MAX_INVITES) {
    return NextResponse.json({ error: 'Mandaste muchas invitaciones seguidas — esperá unos minutos.' }, { status: 429 });
  }

  const { data, error } = await supabase
    .from('project_collaborators')
    .insert({
      project_id: projectId,
      profile_id: profile.id,
      contribution: body.contribution ?? '',
      invited_by: user.id,
    })
    .select('*, profile:profiles(handle, display_name, avatar_image)')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Esa persona ya está acreditada en este proyecto.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (project?.name) await notifyInvitee(profile.id, project.name);
  return NextResponse.json(data, { status: 201 });
}
