import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverError } from '@/lib/api-errors';
import { getClaimsUser } from '@/lib/supabase/claims';

// Créditos donde la cuenta logueada es la persona acreditada (no el
// dueño del proyecto) — usado por /admin/portfolio para mostrar
// invitaciones pendientes y colaboraciones ya aceptadas.
export async function GET() {
  const supabase = await createClient();
  const user = await getClaimsUser(supabase);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await supabase
    .from('project_collaborators')
    .select('*, project:projects(slug, name, masterplan_image)')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return serverError(error);
  return NextResponse.json({ collaborations: data ?? [] });
}
