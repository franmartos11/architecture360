import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Query liviana dedicada al polling del ícono de mensajes — separada de
// GET /api/conversations para no traer la lista completa cada 30s.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { data: conversations } = await supabase
    .from('conversations')
    .select('id')
    .or(`participant_one.eq.${user.id},participant_two.eq.${user.id}`);
  const ids = (conversations ?? []).map(c => c.id);
  if (ids.length === 0) return NextResponse.json({ count: 0 });

  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', ids)
    .neq('sender_id', user.id)
    .is('read_at', null);

  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
