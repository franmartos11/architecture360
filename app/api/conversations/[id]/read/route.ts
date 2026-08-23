import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/conversations/[id]/read → marca como leídos los mensajes que
// mandó el otro participante — la RLS de messages ya limita esto a filas
// de conversaciones donde el usuario participa, no hace falta revalidarlo acá.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { error } = await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('conversation_id', id)
    .neq('sender_id', user.id)
    .is('read_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
