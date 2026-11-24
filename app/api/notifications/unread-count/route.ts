import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getClaimsUser } from '@/lib/supabase/claims';

// Query liviana dedicada al polling de la campanita — separada de
// GET /api/notifications para no traer la lista completa cada 30s.
export async function GET() {
  const supabase = await createClient();
  const user = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ count: 0 });

  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
