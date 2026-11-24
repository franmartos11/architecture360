import { NextResponse } from 'next/server';
import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { rateLimitOrRespond } from '@/lib/rate-limit';

// ─── Google Routes API (computeRouteMatrix) ─────────────────────────
// Reemplaza a la Distance Matrix legacy, que Google ya no habilita en
// proyectos nuevos (devolvía REQUEST_DENIED y se guardaban tiempos vacíos).
const ROUTES_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';
const FIELD_MASK = 'originIndex,destinationIndex,duration,condition,status';
// Routes admite hasta 625 elementos por pedido; 100 deja margen de sobra.
const DESTINATIONS_PER_REQUEST = 100;

const MAX_POI_IDS = 5;

type TravelMode = 'DRIVE' | 'WALK' | 'BICYCLE';
interface LatLng { lat: number; lng: number }

interface MatrixElement {
  destinationIndex?: number;
  duration?: string; // "123s"
  condition?: string;
  status?: { code?: number };
}

type MinutesResult = { ok: true; minutes: (number | null)[] } | { ok: false; error: string };

function routesErrorMessage(status: number | null): string {
  if (status == null) return 'No se pudo conectar con Google Routes. Probá de nuevo en un momento.';
  if (status === 403) return 'Google Routes respondió un error (403). Revisá que Routes API esté habilitada en GOOGLE_MAPS_API_KEY.';
  if (status === 429) return 'Se alcanzó la cuota de Google Routes. Probá de nuevo en un rato.';
  return `Google Routes respondió un error (${status}). Probá de nuevo en un momento.`;
}

const waypoint = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });

/**
 * Minutos desde `origin` a cada destino en un modo. Un destino sin ruta
 * (ROUTE_NOT_FOUND, ej. bici donde Google no la ofrece) da null; un error
 * del pedido entero da { ok: false } para no guardar nada.
 */
async function fetchTravelMinutes(key: string, origin: LatLng, destinations: LatLng[], mode: TravelMode): Promise<MinutesResult> {
  const minutes: (number | null)[] = destinations.map(() => null);
  for (let start = 0; start < destinations.length; start += DESTINATIONS_PER_REQUEST) {
    const chunk = destinations.slice(start, start + DESTINATIONS_PER_REQUEST);
    const res = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({ origins: [waypoint(origin)], destinations: chunk.map(waypoint), travelMode: mode }),
    }).catch(() => null);

    if (!res || !res.ok) {
      if (res) console.error('[calculate-travel-times] Routes', mode, res.status, await res.text().catch(() => ''));
      return { ok: false, error: routesErrorMessage(res?.status ?? null) };
    }

    const elements: MatrixElement[] = await res.json().catch(() => []);
    for (const el of Array.isArray(elements) ? elements : []) {
      if (el.destinationIndex == null || el.condition !== 'ROUTE_EXISTS' || !el.duration) continue;
      const seconds = parseFloat(el.duration);
      if (Number.isFinite(seconds)) minutes[start + el.destinationIndex] = Math.round(seconds / 60);
    }
  }
  return { ok: true, minutes };
}

// ─── Handler ──────────────────────────────────────────────────────────
// Body: { projectId, poiIds?, overwrite? }
// - Sin poiIds: completa los POIs ubicados que no tienen ningún tiempo
//   (se dispara solo al abrir Ubicación). Nunca pisa tiempos cargados.
// - Con poiIds (1–5): solo esos; con overwrite recalcula aunque tengan
//   tiempos (pin movido: los tiempos viejos ya no sirven).
export async function POST(req: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: 'GOOGLE_MAPS_API_KEY no configurada en variables de entorno.' },
      { status: 500 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { projectId, poiIds: rawPoiIds, overwrite: rawOverwrite } = body as {
    projectId?: string; poiIds?: unknown; overwrite?: unknown;
  };
  if (!projectId) {
    return NextResponse.json({ error: 'projectId requerido.' }, { status: 400 });
  }

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
  if (rawOverwrite !== undefined && typeof rawOverwrite !== 'boolean') {
    return NextResponse.json({ error: 'overwrite debe ser true o false.' }, { status: 400 });
  }
  const overwrite = rawOverwrite === true;
  if (overwrite && !poiIds) {
    return NextResponse.json({ error: 'overwrite solo se puede usar con poiIds.' }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId, { revalidate: true });
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase, user } = access;

  // Routes se paga por elemento: frenar clics/automatizaciones repetidas.
  // El modo por POI va de a 1 destino y se dispara solo al agregar/mover.
  const limited = poiIds
    ? await rateLimitOrRespond(
        { key: `calculate-travel-times-poi:user:${user.id}`, windowSeconds: 300, max: 60 },
        'Agregaste o moviste muchos puntos seguidos — esperá unos minutos para calcular más tiempos.'
      )
    : await rateLimitOrRespond(
        { key: `calculate-travel-times:user:${user.id}`, windowSeconds: 300, max: 10 },
        'Se calcularon tiempos hace poco — esperá unos minutos.'
      );
  if (limited) return limited;

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

  const { data: pois, error: poiErr } = await supabase
    .from('points_of_interest')
    .select('id, latitude, longitude, drive_minutes, walk_minutes, bike_minutes')
    .eq('project_id', projectId);

  if (poiErr) {
    return NextResponse.json({ error: 'Error al leer POIs.' }, { status: 500 });
  }

  const targets = (pois ?? []).filter((p) => {
    if (p.latitude == null || p.longitude == null) return false;
    if (poiIds && !poiIds.includes(p.id)) return false;
    if (overwrite) return true;
    return p.drive_minutes == null && p.walk_minutes == null && p.bike_minutes == null;
  });

  if (targets.length === 0) return NextResponse.json({ updated: 0, times: [] });

  const origin = { lat: project.latitude, lng: project.longitude };
  const destinations = targets.map((p) => ({ lat: p.latitude as number, lng: p.longitude as number }));

  const [drive, walk, bike] = await Promise.all([
    fetchTravelMinutes(key, origin, destinations, 'DRIVE'),
    fetchTravelMinutes(key, origin, destinations, 'WALK'),
    fetchTravelMinutes(key, origin, destinations, 'BICYCLE'),
  ]);

  // Si Google falló en cualquier modo no se guarda nada: antes se
  // escribían nulls y se perdían los tiempos que hubiera.
  const failed = [drive, walk, bike].find((r): r is { ok: false; error: string } => !r.ok);
  if (failed) return NextResponse.json({ error: failed.error }, { status: 502 });

  const times = targets.map((p, i) => ({
    id: p.id,
    drive_minutes: (drive as { minutes: (number | null)[] }).minutes[i],
    walk_minutes: (walk as { minutes: (number | null)[] }).minutes[i],
    bike_minutes: (bike as { minutes: (number | null)[] }).minutes[i],
  }));

  const results = await Promise.all(times.map(({ id, ...t }) =>
    supabase.from('points_of_interest').update(t).eq('id', id)
  ));
  const errors = results.filter((r) => r.error);
  if (errors.length > 0) {
    console.error('[calculate-travel-times] Update errors:', errors.map((r) => r.error));
    return NextResponse.json({ error: `Error al actualizar ${errors.length} POIs.` }, { status: 500 });
  }

  return NextResponse.json({ updated: times.length, times });
}
