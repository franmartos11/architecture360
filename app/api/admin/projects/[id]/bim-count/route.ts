import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { createAdminClient } from '@/lib/supabase/admin';

// Lo consulta DeleteProjectModal al abrirse, para saber si mostrar la
// elección "conservar / eliminar también" y cuántas piezas de otros
// colaboradores se van a desvincular.
//
// Usa el cliente admin (no el de sesión de requireProjectAccess) para
// leer bim_models: las policies de RLS de esa tabla solo dejan ver piezas
// públicas y listas (is_public && status='ready') o las propias — así que
// con el cliente de sesión, una pieza privada o todavía en
// processing/failed de OTRO colaborador quedaría invisible y el conteo
// de "other" saldría de menos (hasta cero). requireProjectAccess() ya
// filtra quién puede pegarle a este endpoint (solo el dueño del
// proyecto), así que usar el admin acá no afluja esa gate, solo corrige
// qué puede ver un caller ya autorizado — mismo criterio que ya usa el
// DELETE de esta misma ruta para bim_models.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin.from('bim_models').select('author_id').eq('project_id', id);
  const rows = (data ?? []) as { author_id: string }[];
  const own = rows.filter(r => r.author_id === access.user.id).length;

  return NextResponse.json({ own, other: rows.length - own });
}
