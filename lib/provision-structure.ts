import type { SupabaseClient } from '@supabase/supabase-js';
import { slugify, ensureUniqueSlug } from '@/lib/slug';

// Formas "de una sola cosa" (hoy: "casa") no tienen paso para crear el
// building ni la unidad — el proyecto ES esa casa. Esta función arma toda
// la estructura interna de una: building + piso invisible + unidad, todo
// con el mismo nombre. Se llama al crear el proyecto (POST
// /api/admin/projects) y como red de seguridad en el wizard si por algún
// motivo la casa no existe todavía.
//
// El que llama es responsable de no invocarla dos veces (chequear que el
// proyecto no tenga ya un building). Usa el cliente de sesión que se le
// pase — las policies de RLS ya permiten escribir en un proyecto propio.
export async function provisionSingleUnitStructure(
  supabase: SupabaseClient,
  opts: { projectId: string; name: string; planImage?: string | null },
): Promise<{ buildingId: string; floorId: string | null; unitId: string | null }> {
  const slug = await ensureUniqueSlug(supabase, {
    table: 'buildings', column: 'slug', base: slugify(opts.name),
    scope: { column: 'project_id', value: opts.projectId },
  });

  const { data: building, error } = await supabase
    .from('buildings')
    .insert({ project_id: opts.projectId, slug, name: opts.name, total_floors: 1 })
    .select('id')
    .single();
  if (error || !building) throw new Error(error?.message ?? 'No se pudo crear la casa');

  const { data: floor } = await supabase
    .from('floors')
    .insert({ building_id: building.id, number: 1, label: 'Casa', plan_image: opts.planImage ?? null })
    .select('id')
    .single();

  let unitId: string | null = null;
  if (floor?.id) {
    const { data: unit } = await supabase
      .from('units')
      .insert({ floor_id: floor.id, code: opts.name, type: '2 dormitorios' })
      .select('id')
      .single();
    unitId = unit?.id ?? null;
  }

  return { buildingId: building.id, floorId: floor?.id ?? null, unitId };
}
