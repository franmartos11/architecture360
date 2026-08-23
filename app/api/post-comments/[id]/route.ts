import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// El autor del comentario o el autor del post pueden borrarlo — RLS (dos
// policies OR'd) es la autoridad real acá, mismo criterio que project_comments.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase.from('post_comments').delete().eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  return NextResponse.json({ success: true });
}
