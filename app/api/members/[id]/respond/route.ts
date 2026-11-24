import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';
import { escapeHtml } from '@/lib/sanitize';
import { parseJsonBody } from '@/lib/api-validate';
import { z } from 'zod';
import { serverError } from '@/lib/api-errors';
import { getClaimsUser } from '@/lib/supabase/claims';

const bodySchema = z.object({
  status: z.enum(['accepted', 'declined'], { message: "status debe ser 'accepted' o 'declined'" }),
});

// La persona invitada acepta o rechaza su propia invitación — no depende de
// tener rol alguno en el proyecto, sino de ser el user_id de la fila.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const parsed = await parseJsonBody(request, bodySchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { data, error } = await supabase
    .from('project_members')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    // Solo se responde una invitación pendiente: si ya se aceptó o rechazó
    // no hay fila que actualizar (404) y no se vuelve a notificar.
    .eq('status', 'pending')
    .select()
    .maybeSingle();

  if (error) {
    // 42501: el trigger guard_project_members rechazó el cambio.
    if (error.code === '42501') return NextResponse.json({ error: 'No tenés permiso para responder esta invitación' }, { status: 403 });
    return serverError(error);
  }
  if (!data) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });

  if (body.status === 'accepted' && data.invited_by) {
    await notify({ recipientId: data.invited_by, actorId: user.id, type: 'project_invite_accepted', entityId: data.project_id });
    try {
      const [{ data: project }, { data: profile }] = await Promise.all([
        supabase.from('projects').select('name').eq('id', data.project_id).maybeSingle(),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ]);
      const { data: { user: inviter } } = await createAdminClient().auth.admin.getUserById(data.invited_by);
      if (inviter?.email && project?.name) {
        await sendEmail({
          to: inviter.email,
          subject: `${profile?.display_name ?? 'Alguien'} aceptó sumarse a "${project.name}"`,
          html: `<p><strong>${escapeHtml(profile?.display_name ?? 'Esa persona')}</strong> aceptó tu invitación y ya es parte del equipo de <strong>${escapeHtml(project.name)}</strong>.</p>`,
        });
      }
    } catch (err) {
      console.error('[members] no se pudo notificar a quien invitó', err);
    }
  }

  return NextResponse.json(data);
}
