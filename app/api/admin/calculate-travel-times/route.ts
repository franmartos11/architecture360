import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { rateLimitOrRespond } from '@/lib/rate-limit';

// ─── Google Distance Matrix API ─────────────────────────────────────
const GMAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;

const MAX_POI_IDS = 5;

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
  const { projectId, poiIds: rawPoiIds } = body as { projectId?: string; poiIds?: unknown };
  if (!projectId) {
    return NextResponse.json({ error: 'projectId requerido.' }, { status: 400 });
  }
  // poiIds: modo "punto recién agregado" — calcula solo esos y solo si no
  // tienen ningún tiempo cargado, para nunca pisar tiempos puestos a mano.
  let poiIds: string[] | null = null;
  if (rawPoiIds !== undefined) {
    // Tope chico: el modo por POI tiene un rate limit más generoso que el
    // de todo el proyecto, y no tiene que servir para saltearlo.
    if (
      !Array.isArray(rawPoiIds) || rawPoiIds.length === 0 || rawPoiIds.length > MAX_POI_IDS ||
      !rawPoiIds.every((id) => typeof id === 'string')
    ) {
      return NextResponse.json({ error: `poiIds debe ser una lista de 1 a ${MAX_POI_IDS} ids.` }, { status: 400 });
    }
    poiIds = rawPoiIds as string[];
  }

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  // Cada llamada golpea la Distance Matrix API de Google, que se paga por
  // uso — sin esto, alguien con la sesión podría hacer clic repetido (o
  // automatizarlo) y generar un costo real sin ningún freno.
  // El modo por POI se dispara solo al agregar cada punto desde el
  // buscador — 1 destino por llamada, de ahí el límite más alto.
  const limited = poiIds
    ? await rateLimitOrRespond(
        { key: `calculate-travel-times-poi:user:${user.id}`, windowSeconds: 300, max: 60 },
        'Agregaste muchos puntos seguidos — esperá unos minutos para calcular más tiempos.'
      )
    : await rateLimitOrRespond(
        { key: `calculate-travel-times:user:${user.id}`, windowSeconds: 300, max: 5 },
        'Ya calculaste los tiempos hace poco — esperá unos minutos antes de repetirlo.'
      );
  if (limited) return limited;

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
    .select('id, latitude, longitude, drive_minutes, walk_minutes, bike_minutes')
    .eq('project_id', projectId);

  if (poiErr) {
    return NextResponse.json({ error: 'Error al leer POIs.' }, { status: 500 });
  }

  const poisWithCoords = (pois ?? []).filter(
    (p) => p.latitude != null && p.longitude != null &&
      (!poiIds || (poiIds.includes(p.id) && p.drive_minutes == null && p.walk_minutes == null && p.bike_minutes == null))
  );

  if (poisWithCoords.length === 0) {
    return NextResponse.json(poiIds
      ? { updated: 0, times: [] }
      : { updated: 0, message: 'Ningún POI tiene coordenadas para calcular.' });
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

  if (poiIds) {
    const times = poisWithCoords.map((p, i) => ({
      id: p.id,
      drive_minutes: driveMinutes[i],
      walk_minutes: walkMinutes[i],
      bike_minutes: bikeMinutes[i],
    }));
    return NextResponse.json({ updated: poisWithCoords.length, times });
  }
  return NextResponse.json({ updated: poisWithCoords.length });
}
