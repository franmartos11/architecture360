import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveProjectIdFromBuilding } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import { getProjectTypeConfig } from '@/lib/project-types';
import type { SupabaseClient } from '@supabase/supabase-js';

// Copia completa de un edificio: pisos → unidades, remapeando FKs con un
// Map viejo→nuevo por nivel (mismo enfoque que
// app/api/admin/projects/[id]/duplicate/route.ts). A diferencia de
// app/api/admin/floors/[id]/duplicate/route.ts (que remapea el número de
// piso en el código de cada unidad porque duplica DENTRO del mismo
// edificio), acá el edificio destino es nuevo — no hay colisión de
// número de piso ni necesidad de retocar los códigos.
//
// No se copia ninguna silueta en aerial_hotspots: un edificio duplicado
// todavía no tiene lugar marcado en la foto aérea, igual que uno nuevo.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const projectId = await resolveProjectIdFromBuilding(id);
  if (!projectId) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data: project } = await supabase.from('projects').select('project_type, sale_mode').eq('id', projectId).maybeSingle();
  const typeConfig = getProjectTypeConfig(project?.project_type ?? '', project?.sale_mode ?? '');
  if (typeConfig.singleBuilding) {
    return NextResponse.json({
      error: typeConfig.unitIsLand
        ? 'Este loteo ya tiene su etapa cargada. Para desarrollos con varias etapas, escribinos.'
        : `Este proyecto ya tiene su ${typeConfig.buildingLabel.toLowerCase()} — este tipo de proyecto no admite más de una.`,
    }, { status: 409 });
  }

  const { data: source, error: sourceError } = await supabase.from('buildings').select('*').eq('id', id).maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: 'Edificio no encontrado' }, { status: 404 });

  const name = `${source.name} (copia)`;
  const slug = await ensureUniqueSlug(supabase, {
    table: 'buildings', column: 'slug', base: slugify(name),
    scope: { column: 'project_id', value: projectId },
  });

  const { data: created, error: createError } = await supabase
    .from('buildings')
    .insert({
      project_id: projectId,
      slug,
      name,
      total_floors: source.total_floors,
      amenities_tour: source.amenities_tour,
      cover_image: source.cover_image,
      tour_orientation_degrees: source.tour_orientation_degrees,
    })
    .select('id, slug, name')
    .single();

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });

  try {
    await copyBuildingFloors(supabase, id, created.id as string);
  } catch (e) {
    // El edificio ya quedó creado — mejor una copia con contenido a medias
    // (visible, se puede terminar a mano) que dejar el error silencioso.
    console.error('Error copiando pisos/unidades al duplicar el edificio', id, '→', created.id, e);
  }

  return NextResponse.json(created, { status: 201 });
}

async function copyBuildingFloors(supabase: SupabaseClient, sourceBuildingId: string, newBuildingId: string) {
  const { data: floors } = await supabase.from('floors').select('*').eq('building_id', sourceBuildingId);
  if (!floors || floors.length === 0) return;

  const { data: newFloors, error } = await supabase
    .from('floors')
    .insert(floors.map(f => ({
      building_id: newBuildingId,
      number: f.number,
      label: f.label,
      plan_image: f.plan_image,
      unit_dots: f.unit_dots,
      floor_kind: f.floor_kind,
      floor_kind_description: f.floor_kind_description,
    })))
    .select('id');
  if (error) throw error;

  const floorIdMap = new Map<string, string>();
  floors.forEach((f, i) => floorIdMap.set(f.id, newFloors![i].id));

  const { data: units } = await supabase.from('units').select('*').in('floor_id', floors.map(f => f.id));
  if (!units || units.length === 0) return;

  const { error: unitsError } = await supabase.from('units').insert(units.map(u => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id: _id, floor_id, created_at, updated_at, ...rest } = u;
    return { ...rest, floor_id: floorIdMap.get(floor_id) };
  }));
  if (unitsError) throw unitsError;
}
