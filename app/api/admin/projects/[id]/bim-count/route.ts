import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';

// Lo consulta DeleteProjectModal al abrirse, para saber si mostrar la
// elección "conservar / eliminar también" y cuántas piezas de otros
// colaboradores se van a desvincular.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data } = await access.supabase.from('bim_models').select('author_id').eq('project_id', id);
  const rows = (data ?? []) as { author_id: string }[];
  const own = rows.filter(r => r.author_id === access.user.id).length;

  return NextResponse.json({ own, other: rows.length - own });
}
