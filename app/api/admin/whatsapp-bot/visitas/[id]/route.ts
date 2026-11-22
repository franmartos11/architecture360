import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import type { WaVisita } from '@/types/whatsapp-bot';

type Ctx = { params: Promise<{ id: string }> };

const CambioVisita = z
  .object({
    estado: z.enum(['agendada', 'confirmada', 'cancelada', 'realizada', 'no_vino']),
    notas: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .refine((c) => c.estado !== undefined || c.notas !== undefined, 'Nada para cambiar');

/** Cambiar estado o notas de una visita (gestor en adelante). No le avisa nada al cliente. */
export async function PATCH(request: Request, { params }: Ctx) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: v } = await supabase.from('wa_visitas').select('id, project_id').eq('id', id).maybeSingle();
  if (!v) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 });
  const access = await requireProjectAccess(v.project_id as string, { minRole: 'gestor' });
  if (!access) return NextResponse.json({ error: 'Visita no encontrada' }, { status: 404 });

  const parsed = CambioVisita.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido' }, { status: 400 });
  const cambios: Partial<WaVisita> = {};
  if (parsed.data.estado) cambios.estado = parsed.data.estado;
  if (parsed.data.notas !== undefined) cambios.notas = parsed.data.notas || null;

  const { data, error } = await access.supabase
    .from('wa_visitas')
    .update(cambios)
    .eq('id', id)
    .eq('project_id', v.project_id)
    .select('*')
    .single();
  if (error) {
    // Reabrir una visita cancelada en un turno que ya tomó otra.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ese horario ya tiene otra visita agendada' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data as WaVisita);
}
