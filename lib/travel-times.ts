// Cliente del cálculo automático de tiempos de viaje de los puntos de
// interés (ruta /api/admin/calculate-travel-times, Google Routes API).

export interface TravelTimes {
  id: string;
  drive_minutes: number | null;
  walk_minutes: number | null;
  bike_minutes: number | null;
}

export type TravelTimesResult =
  | { ok: true; times: TravelTimes[] }
  | { ok: false; status: number; error: string };

/** Un punto necesita tiempos si está ubicado y no tiene ninguno cargado. */
export function needsTravelTimes(p: {
  latitude: number | null; longitude: number | null;
  drive_minutes: number | null; walk_minutes: number | null; bike_minutes: number | null;
}): boolean {
  return p.latitude != null && p.longitude != null &&
    p.drive_minutes == null && p.walk_minutes == null && p.bike_minutes == null;
}

const GENERIC_ERROR = 'No se pudieron calcular los tiempos de viaje.';

/**
 * Sin poiIds completa los puntos del proyecto que no tienen tiempos; con
 * poiIds calcula esos (overwrite: aunque ya tengan, ej. pin movido).
 */
export async function requestTravelTimes(opts: {
  projectId: string; poiIds?: string[]; overwrite?: boolean;
}): Promise<TravelTimesResult> {
  const body: Record<string, unknown> = { projectId: opts.projectId };
  if (opts.poiIds) body.poiIds = opts.poiIds;
  if (opts.overwrite) body.overwrite = true;

  const res = await fetch('/api/admin/calculate-travel-times', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => null);
  if (!res) return { ok: false, status: 0, error: GENERIC_ERROR };

  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.error ?? GENERIC_ERROR };
  return { ok: true, times: Array.isArray(data.times) ? data.times : [] };
}
