import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const PAGE_SIZE = 20;
const ACTOR_SELECT = '*, actor:profiles!notifications_actor_id_fkey(handle, display_name, avatar_image)';

// GET /api/notifications?before= → paginado, más reciente primero.
// Degrada a lista vacía si la tabla todavía no existe (falta correr la
// migración) en vez de un 500 que rompa el resto de la UI.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const before = searchParams.get('before');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ notifications: [], hasMore: false, unreadCount: 0 });

  let query = supabase
    .from('notifications')
    .select(ACTOR_SELECT)
    .eq('recipient_id', user.id)
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;
  if (error) return NextResponse.json({ notifications: [], hasMore: false, unreadCount: 0 });

  const rows = data ?? [];
  const hasMore = rows.length > PAGE_SIZE;
  const page = rows.slice(0, PAGE_SIZE);

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  return NextResponse.json({ notifications: page, hasMore, unreadCount: count ?? 0 });
}
