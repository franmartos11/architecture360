import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';

// ─── Google Distance Matrix API ─────────────────────────────────────
const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

type TravelMode = 'driving' | 'walking' | 'bicycling';

interface DistanceMatrixElement {
  status: string;
  duration?: { value: number; text: string }; // value en segundos
}
interface DistanceMatrixResponse {
  status: string;
  rows: { elements: DistanceMatrixElement[] }[];
}

/**
 * Llama a la Distance Matrix API de Google para un origen y varios destinos.
 * Devuelve los tiempos en minutos para cada destino (null si no disponible).
 */
async function fetchTravelMinutes(
  origin: string,       // "lat,lng"
  destinations: string[], // ["lat,lng", ...]
  mode: TravelMode,
): Promise<(number | null)[]> {
  if (!GMAPS_KEY || destinations.length === 0) return destinations.map(() => null);

  const url = new URL('https://maps.googleapis.com/maps/api/distancematrix/json');
  url.searchParams.set('origins', origin);
  url.searchParams.set('destinations', destinations.join('|'));
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', GMAPS_KEY);

  const res = await fetch(url.toString(), { next: { revalidate: 0 } });
  const data: DistanceMatrixResponse = await res.json();

  if (data.status !== 'OK') {
    console.error('[calculate-travel-times] GMaps error:', data.status);
    return destinations.map(() => null);
  }

  return data.rows[0]?.elements.map((el) =>
    el.status === 'OK' && el.duration ? Math.round(el.duration.value / 60) : null
  ) ?? destinations.map(() => null);
}

// ─── Handler ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!GMAPS_KEY) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY no configurada en variables de entorno.' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { projectId } = body as { projectId?: string };
  if (!projectId) {
    return NextResponse.json({ error: 'projectId requerido.' }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  // 1. Leer coords del proyecto
  const { data: project, error: pErr } = await supabase
    .from('projects')
    .select('id, latitude, longitude')
    .eq('id', projectId)
    .maybeSingle();

  if (pErr || !project) {
    return NextResponse.json({ error: 'Proyecto no encontrado.' }, { status: 404 });
  }
  if (project.latitude == null || project.longitude == null) {
    return NextResponse.json(
      { error: 'El proyecto no tiene coordenadas. Configurá latitud/longitud en Datos Generales.' },
      { status: 422 }
    );
  }

  const origin = `${project.latitude},${project.longitude}`;

  // 2. Leer POIs con coords
  const { data: pois, error: poiErr } = await supabase
    .from('points_of_interest')
    .select('id, latitude, longitude')
    .eq('project_id', projectId);

  if (poiErr) {
    return NextResponse.json({ error: 'Error al leer POIs.' }, { status: 500 });
  }

  const poisWithCoords = (pois ?? []).filter(
    (p) => p.latitude != null && p.longitude != null
  );

  if (poisWithCoords.length === 0) {
    return NextResponse.json({ updated: 0, message: 'Ningún POI tiene coordenadas para calcular.' });
  }

  const destinations = poisWithCoords.map((p) => `${p.latitude},${p.longitude}`);

  // 3. Llamar Distance Matrix para los 3 modos en paralelo
  const [driveMinutes, walkMinutes, bikeMinutes] = await Promise.all([
    fetchTravelMinutes(origin, destinations, 'driving'),
    fetchTravelMinutes(origin, destinations, 'walking'),
    fetchTravelMinutes(origin, destinations, 'bicycling'),
  ]);

  // 4. Actualizar cada POI en Supabase
  const updates = poisWithCoords.map((p, i) =>
    supabase
      .from('points_of_interest')
      .update({
        drive_minutes: driveMinutes[i],
        walk_minutes: walkMinutes[i],
        bike_minutes: bikeMinutes[i],
      })
      .eq('id', p.id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    console.error('[calculate-travel-times] Update errors:', errors.map((r) => r.error));
    return NextResponse.json(
      { error: `Error al actualizar ${errors.length} POIs.` },
      { status: 500 }
    );
  }

  return NextResponse.json({ updated: poisWithCoords.length });
}
