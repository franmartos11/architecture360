import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { notify } from '@/lib/notify';
import { parseJsonBody } from '@/lib/api-validate';
import { serverError } from '@/lib/api-errors';
import { getClaimsUser } from '@/lib/supabase/claims';

const respondSchema = z.object({
  status: z.enum(['accepted', 'declined'], { message: 'Estado inválido' }),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = await parseJsonBody(request, respondSchema);
  if ('error' in parsed) return parsed.error;
  const { status } = parsed.data;

  const supabase = await createClient();
  const user = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (status === 'declined') {
    // La RLS ya limita al destinatario; el filtro explícito además da el 404.
    const { data, error } = await supabase
      .from('project_ownership_transfers')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('to_user', user.id)
      .eq('status', 'pending')
      .select('id');
    if (error) return serverError(error);
    if (!data?.length) return NextResponse.json({ error: 'Transferencia no encontrada' }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  // Se lee antes de la RPC para conocer a from_user: después de aceptar el
  // estado cambia y ya no hay "pendiente" que consultar.
  const { data: transfer, error: readError } = await supabase
    .from('project_ownership_transfers')
    .select('from_user')
    .eq('id', id)
    .eq('to_user', user.id)
    .maybeSingle();
  if (readError) return serverError(readError);
  if (!transfer) return NextResponse.json({ error: 'Transferencia no encontrada' }, { status: 404 });

  const { data: projectId, error } = await supabase.rpc('accept_ownership_transfer', { p_transfer_id: id });
  if (error) {
    // Los raise de accept_ownership_transfer() llevan un mensaje escrito para
    // el usuario y un código propio; cualquier otro error no se filtra.
    const status = ({ P0002: 404, '42501': 403, '55000': 409 } as Record<string, number>)[error.code ?? ''];
    const raised = error.message; // texto del raise, escrito para el usuario
    if (status) return NextResponse.json({ error: raised }, { status });
    return serverError(error);
  }

  await notify({ recipientId: transfer.from_user, actorId: user.id, type: 'ownership_transfer_accepted', entityId: projectId });
  return NextResponse.json({ projectId });
}
