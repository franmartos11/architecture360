import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { getProjectBySlug } from '@/data/project-repository';

// Devuelve el proyecto activo con el mismo shape (camelCase, Project
// completo con buildings/units/amenities/etc.) que usa la landing
// pública — reusa getProjectBySlug() en vez de duplicar el mapeo, así
// la vista previa en vivo de /admin/sitio renderiza EXACTAMENTE lo mismo
// que ve un visitante real, no una aproximación con datos crudos.
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: row } = await supabase.from('projects').select('slug').eq('id', projectId).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const project = await getProjectBySlug(row.slug);
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  return NextResponse.json({ project });
}
