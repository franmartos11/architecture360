import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { PedidoBot } from '@/lib/whatsapp-bot/esquemas';

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  // Vincular, desvincular o reiniciar el número: administrador en adelante.
  const access = await requireProjectAccess(projectId, { minRole: 'administrador' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const parsed = PedidoBot.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });

  const { data: existente } = await supabase.from('wa_bots').select('id').eq('project_id', projectId).maybeSingle();
  const campos = { pedido: parsed.data.pedido, pedido_at: new Date().toISOString() };
  const query = existente
    ? supabase.from('wa_bots').update(campos).eq('id', existente.id)
    : supabase.from('wa_bots').insert({ ...campos, project_id: projectId, vendedor_user_id: user.id });
  const { data, error } = await query.select('id, pedido, pedido_at').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
