import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { CambioPregunta, camposDeError } from '@/lib/whatsapp-bot/esquemas';
import type { WaPregunta } from '@/types/whatsapp-bot';
import { serverError } from '@/lib/api-errors';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Lee la pregunta con el cliente de sesión (RLS: administrador en adelante)
 * para resolver el proyecto; el rol se vuelve a exigir con requireProjectAccess.
 */
async function acceso(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from('wa_preguntas').select('id, project_id').eq('id', id).maybeSingle();
  if (!data) return null;
  const access = await requireProjectAccess(data.project_id as string, { minRole: 'administrador' });
  return access ? { ...access, projectId: data.project_id as string } : null;
}

/** Responder (entra a la ficha del bot), descartar o reabrir. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await acceso(id);
  if (!a) return NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 });

  const parsed = CambioPregunta.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Revisá los datos', campos: camposDeError(parsed.error) }, { status: 400 });
  }
  const { estado, respuesta } = parsed.data;
  const cambios: Partial<WaPregunta> = { estado };
  if (respuesta !== undefined) cambios.respuesta = respuesta?.trim() || null;
  cambios.respondida_at = estado === 'respondida' ? new Date().toISOString() : null;

  const { data, error } = await a.supabase
    .from('wa_preguntas')
    .update(cambios)
    .eq('id', id)
    .eq('project_id', a.projectId)
    .select('*')
    .single();
  if (error) return serverError(error);
  return NextResponse.json(data as WaPregunta);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const { id } = await params;
  const a = await acceso(id);
  if (!a) return NextResponse.json({ error: 'Pregunta no encontrada' }, { status: 404 });
  const { error } = await a.supabase.from('wa_preguntas').delete().eq('id', id).eq('project_id', a.projectId);
  if (error) return serverError(error);
  return NextResponse.json({ ok: true });
}
