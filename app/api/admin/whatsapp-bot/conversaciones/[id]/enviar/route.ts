import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { TextoEnvio } from '@/lib/whatsapp-bot/esquemas';
import { HORAS_MODO_HUMANO } from '@/lib/whatsapp-bot/reglas';
import type { WaConversacion } from '@/types/whatsapp-bot';
import { serverError } from '@/lib/api-errors';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const { id } = await params;
  const { data } = await (await createClient()).from('wa_conversaciones').select('*').eq('id', id).maybeSingle();
  const conv = data as WaConversacion | null;
  if (!conv) return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 });

  // Escribir como vendedor: gestor en adelante, igual que leads.
  const access = await requireProjectAccess(conv.project_id, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const parsed = TextoEnvio.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Mensaje inválido' }, { status: 400 });
  }

  // wa_bots es de administrador en adelante (RLS): un gestor no lo lee con su
  // sesión. Con el acceso ya probado, solo el estado se lee con service-role,
  // atado al proyecto de la conversación.
  const { data: bot } = await createAdminClient()
    .from('wa_bots')
    .select('estado')
    .eq('id', conv.bot_id)
    .eq('project_id', conv.project_id)
    .maybeSingle();
  if (!bot || bot.estado !== 'conectado') {
    return NextResponse.json(
      { error: 'El WhatsApp del proyecto no está conectado. Vinculalo para poder enviar mensajes.' },
      { status: 409 }
    );
  }

  const ahora = new Date();
  const { data: salida, error } = await supabase
    .from('wa_salida')
    .insert({
      bot_id: conv.bot_id,
      conversacion_id: conv.id,
      destino: conv.contacto_wid ?? conv.contacto_numero,
      cuerpo: parsed.data.texto,
      origen: 'vendedor',
      autor_id: user.id,
      orden_at: ahora.toISOString(),
    })
    .select('*')
    .single();
  if (error) return serverError(error);

  const { data: conversacion, error: errConv } = await supabase
    .from('wa_conversaciones')
    .update({
      modo: 'humano',
      humano_hasta: new Date(ahora.getTime() + HORAS_MODO_HUMANO * 3600_000).toISOString(),
    })
    .eq('id', conv.id)
    .select('*')
    .single();
  if (errConv) {
    // La salida ya está encolada: responder 201 para que la UI no reintente y duplique el envío.
    console.error('wa enviar: no se pudo pasar la conversación a modo humano', errConv.message);
  }

  return NextResponse.json({ salida, conversacion }, { status: 201 });
}
