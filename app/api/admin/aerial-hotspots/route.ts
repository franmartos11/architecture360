import { NextResponse } from 'next/server';
import { resolveProjectIdFromSlide, resolveProjectIdFromBuilding, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { aerialHotspotCreateSchema } from '@/lib/content-schemas';

export async function POST(request: Request) {
  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.slideId || !raw.data.buildingId || raw.data.x === undefined || raw.data.y === undefined) {
    return NextResponse.json({ error: 'Faltan slideId, buildingId, x y/o y' }, { status: 400 });
  }
  const parsed = validateJson(raw.data, aerialHotspotCreateSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const [slideProjectId, buildingProjectId] = await Promise.all([
    resolveProjectIdFromSlide(body.slideId),
    resolveProjectIdFromBuilding(body.buildingId),
  ]);
  if (!slideProjectId || !buildingProjectId) {
    return NextResponse.json({ error: 'Vista aérea o edificio no encontrado' }, { status: 404 });
  }
  if (slideProjectId !== buildingProjectId) {
    return NextResponse.json({ error: 'La vista aérea y el edificio no pertenecen al mismo proyecto' }, { status: 400 });
  }

  const access = await requireProjectAccess(slideProjectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const { data, error } = await supabase
    .from('aerial_hotspots')
    .insert({
      slide_id: body.slideId,
      building_id: body.buildingId,
      x: body.x,
      y: body.y,
      polygon: body.polygon ?? null,
    })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
