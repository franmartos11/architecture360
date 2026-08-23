import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { notify } from '@/lib/notify';

// La persona acreditada acepta o rechaza su propia invitación — a
// diferencia del resto de /api/admin/collaborators, esto no depende de
// ser dueño de ningún proyecto, sino de ser la persona invitada.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (body.status !== 'accepted' && body.status !== 'declined') {
    return NextResponse.json({ error: "status debe ser 'accepted' o 'declined'" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('project_collaborators')
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('profile_id', user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Invitación no encontrada' }, { status: 404 });

  if (body.status === 'accepted') {
    await notify(supabase, { recipientId: data.invited_by, actorId: user.id, type: 'collaboration_accepted', entityId: data.project_id });
    try {
      const [{ data: project }, { data: profile }] = await Promise.all([
        supabase.from('projects').select('name').eq('id', data.project_id).maybeSingle(),
        supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle(),
      ]);
      const { data: { user: inviter } } = await createAdminClient().auth.admin.getUserById(data.invited_by);
      if (inviter?.email && project?.name) {
        await sendEmail({
          to: inviter.email,
          subject: `${profile?.display_name ?? 'Alguien'} confirmó el crédito en "${project.name}"`,
          html: `<p><strong>${profile?.display_name ?? 'Esa persona'}</strong> confirmó su crédito en <strong>${project.name}</strong> — ya aparece en la ficha pública del proyecto.</p>`,
        });
      }
    } catch (err) {
      console.error('[collaborators] no se pudo notificar a quien invitó', err);
    }
  }

  return NextResponse.json(data);
}
