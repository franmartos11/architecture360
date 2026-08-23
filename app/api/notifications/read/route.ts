import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// POST /api/notifications/read → marca TODAS las no leídas del usuario
// como leídas, de una — el mismo gesto de "abrí la campanita" ya implica
// que las vio, no hace falta marcar una por una.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', user.id)
    .is('read_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
