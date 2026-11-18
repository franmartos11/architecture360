import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Irse del proyecto: borrar la propia fila. El .eq('user_id') evita depender
// solo de RLS para que esta ruta nunca borre filas ajenas.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('project_members')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Membresía no encontrada' }, { status: 404 });
  return NextResponse.json({ success: true });
}
