import { NextResponse } from 'next/server';
import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { sanitizeText, escapeHtml } from '@/lib/sanitize';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { collaboratorInviteSchema } from '@/lib/content-schemas';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { serverError } from '@/lib/api-errors';


async function notifyInvitee(
  { profileId, actorId, projectId, projectName }: { profileId: string; actorId: string; projectId: string; projectName: string }
) {
  // Dos canales, cada uno best-effort por separado — que falle el mail no
  // debe tapar la notificación in-app, ni al revés.
  await notify({ recipientId: profileId, actorId, type: 'collaboration_invite', entityId: projectId });
  try {
    const { data: { user: invitee } } = await createAdminClient().auth.admin.getUserById(profileId);
    if (!invitee?.email) return;
    await sendEmail({
      to: invitee.email,
      subject: `Te acreditaron en "${projectName}"`,
      // escapeHtml: sanitizeText saca los tags pero decodifica las entidades, así que un
      // nombre guardado como texto "<a href=…>" se interpretaría como HTML en un email.
      html: `<p>Te sumaron como colaborador en <strong>${escapeHtml(projectName)}</strong>.</p>
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

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.handle || typeof raw.data.handle !== 'string') return NextResponse.json({ error: 'Falta el handle de la persona' }, { status: 400 });
  const parsed = validateJson(raw.data, collaboratorInviteSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;
  const contribution = sanitizeText(body.contribution, 300);

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const { data: profile } = await supabase.from('profiles').select('id').eq('handle', body.handle as string).maybeSingle();
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
      .update({ status: 'pending', contribution, invited_by: user.id, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select('*, profile:profiles(handle, display_name, avatar_image)')
      .single();
    if (error) return serverError(error);
    if (project?.name) await notifyInvitee({ profileId: profile.id, actorId: user.id, projectId, projectName: project.name });
    return NextResponse.json(data, { status: 201 });
  }

  // Atómico en Postgres (check_rate_limit): contar filas y después insertar dejaba
  // pasar varios pedidos simultáneos por debajo del tope.
  const limited = await rateLimitOrRespond(
    { key: `collaborators-invite:user:${user.id}`, windowSeconds: 600, max: 10 },
    'Mandaste muchas invitaciones seguidas — esperá unos minutos.'
  );
  if (limited) return limited;

  const { data, error } = await supabase
    .from('project_collaborators')
    .insert({
      project_id: projectId,
      profile_id: profile.id,
      contribution,
      invited_by: user.id,
    })
    .select('*, profile:profiles(handle, display_name, avatar_image)')
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Esa persona ya está acreditada en este proyecto.' }, { status: 409 });
    return serverError(error);
  }
  if (project?.name) await notifyInvitee({ profileId: profile.id, actorId: user.id, projectId, projectName: project.name });
  return NextResponse.json(data, { status: 201 });
}
