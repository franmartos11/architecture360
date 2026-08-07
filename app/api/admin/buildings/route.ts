import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

const PROJECT_SLUG = 'demo';

export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const admin = createAdminClient();
  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const { data: buildings, error } = await admin
    .from('buildings')
    .select('*')
    .eq('project_id', project.id)
    .order('slug');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Conteo de pisos y unidades por edificio, para mostrarlo en el listado.
  const buildingIds = (buildings ?? []).map(b => b.id);
  const { data: floors } = buildingIds.length
    ? await admin.from('floors').select('id, building_id').in('building_id', buildingIds)
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
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  if (!body.slug || !body.name) {
    return NextResponse.json({ error: 'Faltan slug y/o name' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const { data, error } = await admin
    .from('buildings')
    .insert({
      project_id: project.id,
      slug: body.slug,
      name: body.name,
      total_floors: body.totalFloors ?? 1,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
