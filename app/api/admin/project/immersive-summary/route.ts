import { NextResponse } from 'next/server';
import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';

// Conteos para las tarjetas de resumen del capítulo Inmersivo (vistas
// aéreas con hotspots, unidades con recorrido 360°). Solo conteos: antes la
// pantalla bajaba el proyecto entero y todas las unidades con su tour_data
// completo para calcular cuatro números.
export async function GET(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });
  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const [slidesRes, unitsRes, toursRes] = await Promise.all([
    supabase.from('aerial_slides').select('id').eq('project_id', projectId),
    supabase
      .from('units')
      .select('id, floors!inner(buildings!inner(project_id))', { count: 'exact', head: true })
      .eq('floors.buildings.project_id', projectId),
    supabase
      .from('units')
      .select('id, floors!inner(buildings!inner(project_id))', { count: 'exact', head: true })
      .eq('floors.buildings.project_id', projectId)
      .not('tour_data', 'is', null),
  ]);
  if (slidesRes.error) return NextResponse.json({ error: slidesRes.error.message }, { status: 500 });

  const slideIds = (slidesRes.data ?? []).map(s => s.id as string);
  let slidesWithHotspots = 0;
  if (slideIds.length > 0) {
    const { data: hotspots, error } = await supabase.from('aerial_hotspots').select('slide_id').in('slide_id', slideIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    slidesWithHotspots = new Set((hotspots ?? []).map(h => h.slide_id as string)).size;
  }

  return NextResponse.json({
    slides: slideIds.length,
    slidesWithHotspots,
    units: unitsRes.count ?? 0,
    unitsWithTour: toursRes.count ?? 0,
  });
}
