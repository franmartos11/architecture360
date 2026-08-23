import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';

export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: buildings, error } = await supabase
    .from('buildings')
    .select('*')
    .eq('project_id', projectId)
    .order('slug');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Conteo de pisos y unidades por edificio, para mostrarlo en el listado.
  const buildingIds = (buildings ?? []).map(b => b.id);
  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id, building_id').in('building_id', buildingIds)
    : { data: [] };

  const floorCountByBuilding = new Map<string, number>();
  for (const f of floors ?? []) {
    floorCountByBuilding.set(f.building_id, (floorCountByBuilding.get(f.building_id) ?? 0) + 1);
  }

  return NextResponse.json(
    (buildings ?? []).map(b => ({ ...b, floors_loaded: floorCountByBuilding.get(b.id) ?? 0 }))
  );
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (!body.name) {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }

  // Slug generado solo a partir del nombre, único dentro de este proyecto
  // (unique (project_id, slug)) — ver lib/slug.ts.
  const slug = await ensureUniqueSlug(supabase, {
    table: 'buildings', column: 'slug', base: slugify(body.name),
    scope: { column: 'project_id', value: projectId },
  });

  const { data, error } = await supabase
    .from('buildings')
    .insert({
      project_id: projectId,
      slug,
      name: body.name,
      total_floors: body.totalFloors ?? 1,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese slug ya está en uso en este proyecto.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
