import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { rateLimitOrRespond } from '@/lib/rate-limit';

// Mismo patrón que /api/posts/[id]/like — asistir es idempotente (unique
// constraint en event_rsvps), sin notificación (el organizador no
// necesita un aviso por cada asistente).
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const limited = await rateLimitOrRespond({ key: `event-rsvp:user:${user.id}`, windowSeconds: 60, max: 60 });
  if (limited) return limited;

  const { error } = await supabase.from('event_rsvps').insert({ event_id: id, profile_id: user.id });
  // 23505 = ya había confirmado asistencia — idempotente.
  if (error && error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { error } = await supabase.from('event_rsvps').delete().eq('event_id', id).eq('profile_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
