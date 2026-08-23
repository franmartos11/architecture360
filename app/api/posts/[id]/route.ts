import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// RLS ("author write posts") es la autoridad real — si el post no es de
// esta cuenta, el delete simplemente no afecta filas.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase.from('posts').delete().eq('id', id).select();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  return NextResponse.json({ success: true });
}
