import { NextResponse } from 'next/server';
import { resolveRequestedProjectId, requireProjectAccess } from '@/lib/supabase/require-project-access';
import { isValidEnum, POI_CATEGORIES } from '@/lib/validate';
import { sanitizeText } from '@/lib/sanitize';
import { serverError } from '@/lib/api-errors';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { poiCreateSchema } from '@/lib/content-schemas';

export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  if (!raw.data.name || typeof raw.data.name !== 'string') {
    return NextResponse.json({ error: 'Falta name' }, { status: 400 });
  }
  if (raw.data.category !== undefined && !isValidEnum(raw.data.category, POI_CATEGORIES)) {
    return NextResponse.json({ error: `category debe ser uno de: ${POI_CATEGORIES.join(', ')}` }, { status: 400 });
  }
  const parsed = validateJson(raw.data, poiCreateSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const { data, error } = await supabase
    .from('points_of_interest')
    .insert({
      project_id: projectId,
      name: sanitizeText(body.name, 150),
      category: body.category ?? 'otro',
      description: sanitizeText(body.description, 500) || null,
      distance_label: sanitizeText(body.distanceLabel, 100) || null,
      image: body.image ?? null,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      walk_minutes: body.walkMinutes != null ? Number(body.walkMinutes) : null,
      drive_minutes: body.driveMinutes != null ? Number(body.driveMinutes) : null,
      bike_minutes: body.bikeMinutes != null ? Number(body.bikeMinutes) : null,
      sort_order: body.sortOrder ?? 0,
    })
    .select()
    .single();

  if (error) return serverError(error);
  return NextResponse.json(data, { status: 201 });
}
