import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { sanitizeText } from '@/lib/sanitize';
import { getProjectTypeConfig } from '@/lib/project-types';

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

  // Conteo de pisos + id del primer piso por edificio (este último lo usa
  // el redirect de "casa" para ir directo al editor sin un fetch extra).
  const buildingIds = (buildings ?? []).map(b => b.id);
  const { data: floors } = buildingIds.length
    ? await supabase.from('floors').select('id, building_id, number').in('building_id', buildingIds).order('number')
    : { data: [] };

  const floorCountByBuilding = new Map<string, number>();
  const firstFloorByBuilding = new Map<string, string>();
  for (const f of floors ?? []) {
    floorCountByBuilding.set(f.building_id, (floorCountByBuilding.get(f.building_id) ?? 0) + 1);
    if (!firstFloorByBuilding.has(f.building_id)) firstFloorByBuilding.set(f.building_id, f.id);
  }

  return NextResponse.json(
    (buildings ?? []).map(b => ({
      ...b,
      floors_loaded: floorCountByBuilding.get(b.id) ?? 0,
      first_floor_id: firstFloorByBuilding.get(b.id) ?? null,
    }))
  );
}

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();
  if (!body.name || typeof body.name !== 'string') {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }
  const name = sanitizeText(body.name, 150);

  const { data: project } = await supabase
    .from('projects').select('project_type, sale_mode').eq('id', projectId).maybeSingle();
  const typeConfig = getProjectTypeConfig(project?.project_type ?? '', project?.sale_mode ?? '');

  // Formas "de una sola cosa": una casa (el proyecto ES esa casa) o un
  // loteo (una sola etapa). No admiten un segundo building. El cliente ya
  // oculta el alta cuando existe uno; esto blinda contra una llamada
  // directa o una doble creación por carrera.
  if (typeConfig.singleBuilding) {
    const { count } = await supabase
      .from('buildings').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        error: typeConfig.unitIsLand
          ? 'Este loteo ya tiene su etapa cargada. Para desarrollos con varias etapas, escribinos.'
          : `Este proyecto ya tiene su ${typeConfig.buildingLabel.toLowerCase()} — este tipo de proyecto no admite más de una.`,
      }, { status: 409 });
    }
  }

  // Slug generado solo a partir del nombre, único dentro de este proyecto
  // (unique (project_id, slug)) — ver lib/slug.ts.
  const slug = await ensureUniqueSlug(supabase, {
    table: 'buildings', column: 'slug', base: slugify(name),
    scope: { column: 'project_id', value: projectId },
  });

  const { data, error } = await supabase
    .from('buildings')
    .insert({
      project_id: projectId,
      slug,
      name,
      total_floors: body.totalFloors ?? 1,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Ese slug ya está en uso en este proyecto.' }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-provisión de la estructura interna para formas sin paso "Piso"
  // (loteo, dúplex, casa): el building necesita igual un piso interno para
  // colgarle unidades. Antes lo hacía cada pantalla cliente por separado
  // (wizard + /admin/edificios) — se centraliza acá para que las dos den
  // el mismo resultado. Las formas con pisos reales (edificio, único)
  // siguen creando sus N pisos desde el wizard, según total_floors.
  let floorId: string | null = null;
  let unitId: string | null = null;
  if (!typeConfig.hasFloorStep) {
    const { data: floor } = await supabase
      .from('floors')
      .insert({
        building_id: data.id,
        number: 1,
        label: typeConfig.hasUnitStep ? 'Plano' : 'Casa',
        plan_image: typeof body.planImage === 'string' ? body.planImage : null,
      })
      .select('id')
      .single();
    floorId = floor?.id ?? null;

    // Formas donde el building YA ES la unidad (casa): se crea su única
    // unidad ahora, con el mismo nombre del building — así la pantalla de
    // "Datos" edita esos campos directo, sin volver a pedir un código.
    if (floorId && !typeConfig.hasUnitStep) {
      const { data: unit } = await supabase
        .from('units')
        .insert({ floor_id: floorId, code: name, type: '2 dormitorios' })
        .select('id')
        .single();
      unitId = unit?.id ?? null;
    }
  }

  return NextResponse.json({ ...data, floor_id: floorId, unit_id: unitId }, { status: 201 });
}
