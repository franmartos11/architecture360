import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { isBlockedEitherWay } from '@/lib/blocks';

// Mismo patrón que /api/follows/[handle]: identificado por handle (así
// llama MessageThread, que ya tiene other.handle a mano), resuelto a
// perfil adentro de la ruta.

// GET /api/blocks/[handle] → { isBlockedByMe, canMessage }.
// isBlockedByMe solo puede responder sobre bloqueos que YO armé (RLS de
// user_blocks) — es lo que necesita la UI para "Bloquear" vs
// "Desbloquear". canMessage en cambio sí cubre las dos direcciones (vía
// is_blocked_either_way) para poder deshabilitar el composer también
// cuando el OTRO te bloqueó a vos, sin por eso revelar de qué lado vino
// el bloqueo — un booleano no dice quién bloqueó a quién.
export async function GET(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ isBlockedByMe: false, canMessage: true });

  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ isBlockedByMe: false, canMessage: true });

  const [{ data: row }, blockedEitherWay] = await Promise.all([
    supabase.from('user_blocks').select('blocker_id').eq('blocker_id', user.id).eq('blocked_id', target.id).maybeSingle(),
    isBlockedEitherWay(supabase, user.id, target.id),
  ]);

  return NextResponse.json({ isBlockedByMe: !!row, canMessage: !blockedEitherWay });
}

// POST /api/blocks/[handle] → Bloquear
export async function POST(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond({ key: `blocks:user:${user.id}`, windowSeconds: 60, max: 30 });
  if (limited) return limited;

  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: 'No podés bloquearte a vos mismo.' }, { status: 400 });

  // INSERT idempotente — 23505 (unique violation) significa que ya lo
  // tenías bloqueado, no es error real (mismo criterio que follows).
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: user.id, blocked_id: target.id });
  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ isBlockedByMe: true, canMessage: false });
}

// DELETE /api/blocks/[handle] → Desbloquear
export async function DELETE(_req: Request, { params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: target } = await supabase.from('profiles').select('id').eq('handle', handle).maybeSingle();
  if (!target) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });

  await supabase.from('user_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', target.id);

  // El otro pudo haberme bloqueado a mí de forma independiente — hay que
  // recalcular, no asumir canMessage: true solo porque yo desbloqueé.
  const canMessage = !(await isBlockedEitherWay(supabase, user.id, target.id));
  return NextResponse.json({ isBlockedByMe: false, canMessage });
}
