import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// El autor del comentario o el dueño del proyecto pueden borrarlo — RLS
// (dos policies OR'd) es la autoridad real acá; si ninguna aplica, el
// delete simplemente no afecta filas.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase.from('project_comments').delete().eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  return NextResponse.json({ success: true });
}
