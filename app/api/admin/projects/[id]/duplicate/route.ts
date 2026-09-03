import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { slugify, ensureUniqueSlug } from '@/lib/slug';
import type { SupabaseClient } from '@supabase/supabase-js';

// Copia completa de un proyecto: edificios → pisos → unidades, más
// amenidades/vistas aéreas (+ sus hotspots)/puntos de interés. Cada nivel
// remapea sus FKs viejo→nuevo con un Map antes de insertar el siguiente
// (building_id, floor_id, slide_id según corresponda).
//
// Deliberadamente NO se copian: project_collaborators (son invitaciones a
// personas puntuales — copiarlas ataría a alguien a un proyecto que nunca
// aceptó), project_comments y leads (datos de visitantes reales del
// proyecto original).
//
// Límite conocido y aceptado: las imágenes quedan apuntando a la misma URL
// de Storage del original — no se copian los archivos. Más simple, evita
// re-subir todo; si el original borra una foto después, afecta también a
// la copia.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  const { data: source, error: sourceError } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const name = `${source.name} (copia)`;
  const slug = await ensureUniqueSlug(supabase, { table: 'projects', column: 'slug', base: slugify(name) });

  const { data: created, error: createError } = await supabase
    .from('projects')
    .insert({
      slug,
      name,
      owner_id: user.id,
      description: source.description,
      tagline: source.tagline,
      section_config: source.section_config,
      theme_config: source.theme_config,
      location: source.location,
      latitude: source.latitude,
      longitude: source.longitude,
      masterplan_image: source.masterplan_image,
      amenities: source.amenities,
      common_areas_tour: source.common_areas_tour,
      tour_orientation_degrees: source.tour_orientation_degrees,
      project_type: source.project_type,
      sale_mode: source.sale_mode,
      academic_institution: source.academic_institution,
      academic_career: source.academic_career,
      academic_tutor: source.academic_tutor,
      academic_year: source.academic_year,
      academic_team: source.academic_team,
      process_gallery: source.process_gallery,
      before_after: source.before_after,
      // Una copia no debería salir publicada con el mismo contenido que el
      // original sin que el dueño la revise primero.
      published: false,
    })
    .select('id, slug, name')
    .single();

  if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
  const newProjectId = created.id as string;

  try {
    await copyProjectContent(supabase, id, newProjectId);
  } catch (e) {
    // El proyecto ya quedó creado — mejor una copia con contenido a medias
    // (visible, se puede terminar a mano) que dejar el error silencioso.
    console.error('Error copiando contenido al duplicar el proyecto', id, '→', newProjectId, e);
  }

  return NextResponse.json(created, { status: 201 });
}

async function copyProjectContent(supabase: SupabaseClient, sourceProjectId: string, newProjectId: string) {
  const { data: buildings } = await supabase.from('buildings').select('*').eq('project_id', sourceProjectId);
  const buildingIdMap = new Map<string, string>();
  if (buildings && buildings.length > 0) {
    const { data: newBuildings, error } = await supabase
      .from('buildings')
      .insert(buildings.map(b => ({
        project_id: newProjectId,
        slug: b.slug, // único por (project_id, slug) — el project_id ya cambió, no colisiona
        name: b.name,
        total_floors: b.total_floors,
        amenities_tour: b.amenities_tour,
        cover_image: b.cover_image,
        tour_orientation_degrees: b.tour_orientation_degrees,
      })))
      .select('id, slug');
    if (error) throw error;
    // Mismo orden en insert y en la fila fuente — se remapea por índice.
    buildings.forEach((b, i) => buildingIdMap.set(b.id, newBuildings![i].id));

    const { data: floors } = await supabase.from('floors').select('*').in('building_id', buildings.map(b => b.id));
    const floorIdMap = new Map<string, string>();
    if (floors && floors.length > 0) {
      const { data: newFloors, error: floorsError } = await supabase
        .from('floors')
        .insert(floors.map(f => ({
          building_id: buildingIdMap.get(f.building_id),
          number: f.number,
          label: f.label,
          plan_image: f.plan_image,
          unit_dots: f.unit_dots,
          floor_kind: f.floor_kind,
          floor_kind_description: f.floor_kind_description,
        })))
        .select('id');
      if (floorsError) throw floorsError;
      floors.forEach((f, i) => floorIdMap.set(f.id, newFloors![i].id));

      const { data: units } = await supabase.from('units').select('*').in('floor_id', floors.map(f => f.id));
      if (units && units.length > 0) {
        const { error: unitsError } = await supabase.from('units').insert(units.map(u => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, floor_id, created_at, updated_at, ...rest } = u;
          return { ...rest, floor_id: floorIdMap.get(floor_id) };
        }));
        if (unitsError) throw unitsError;
      }
    }
  }

  const { data: amenities } = await supabase.from('amenities').select('*').eq('project_id', sourceProjectId);
  if (amenities && amenities.length > 0) {
    const { error } = await supabase.from('amenities').insert(amenities.map(a => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, project_id, building_id, created_at, ...rest } = a;
      return { ...rest, project_id: newProjectId, building_id: building_id ? (buildingIdMap.get(building_id) ?? null) : null };
    }));
    if (error) throw error;
  }

  const { data: slides } = await supabase.from('aerial_slides').select('*').eq('project_id', sourceProjectId);
  if (slides && slides.length > 0) {
    const { data: newSlides, error } = await supabase
      .from('aerial_slides')
      .insert(slides.map(s => ({
        project_id: newProjectId, image_url: s.image_url, video_url: s.video_url, label: s.label, sort_order: s.sort_order,
      })))
      .select('id');
    if (error) throw error;
    const slideIdMap = new Map<string, string>();
    slides.forEach((s, i) => slideIdMap.set(s.id, newSlides![i].id));

    const { data: hotspots } = await supabase.from('aerial_hotspots').select('*').in('slide_id', slides.map(s => s.id));
    if (hotspots && hotspots.length > 0) {
      const { error: hotspotsError } = await supabase.from('aerial_hotspots').insert(hotspots.map(h => ({
        slide_id: slideIdMap.get(h.slide_id),
        building_id: buildingIdMap.get(h.building_id) ?? h.building_id,
        x: h.x, y: h.y, polygon: h.polygon,
      })));
      if (hotspotsError) throw hotspotsError;
    }
  }

  const { data: pois } = await supabase.from('points_of_interest').select('*').eq('project_id', sourceProjectId);
  if (pois && pois.length > 0) {
    const { error } = await supabase.from('points_of_interest').insert(pois.map(p => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, project_id, ...rest } = p;
      return { ...rest, project_id: newProjectId };
    }));
    if (error) throw error;
  }
}
