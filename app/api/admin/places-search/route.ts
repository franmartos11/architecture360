import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { categoryFromGoogleTypes, type PlaceResult } from '@/lib/google-places';

const PAGE_SIZE = 10;
const BIAS_RADIUS_METERS = 5000;
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.types';

interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  types?: string[];
}

// Mensaje según la causa: 403 casi siempre es la API sin habilitar o la
// clave restringida; 429 es cuota; sin respuesta es red.
function googleErrorMessage(status: number | null): string {
  if (status == null) return 'No se pudo conectar con Google Places. Probá de nuevo en un momento.';
  if (status === 403) return 'Google Places respondió un error (403). Revisá que Places API (New) esté habilitada en GOOGLE_MAPS_API_KEY.';
  if (status === 429) return 'Se alcanzó la cuota de Google Places. Probá de nuevo en un rato.';
  return `Google Places respondió un error (${status}). Probá de nuevo en un momento.`;
}

function parseCoord(v: string | null, limit: number): number | null {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null;
}

// Buscador de lugares del admin: proxy a Places API (New) Text Search con
// la clave del servidor (la misma que usa calculate-travel-times), sesgado
// hacia las coordenadas del proyecto. Server-side para no exponer una
// clave con Places habilitado en el navegador.
export async function GET(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim().slice(0, 200);
  if (!q) return NextResponse.json({ results: [] });

  // Se lee acá (no a nivel de módulo) para que los tests puedan cambiarla.
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return NextResponse.json({ error: 'GOOGLE_MAPS_API_KEY no configurada.' }, { status: 500 });

  // Text Search se factura por llamada — el debounce del cliente no frena
  // a alguien que la automatice.
  const limited = await rateLimitOrRespond({ key: `places-search:user:${user.id}`, windowSeconds: 60, max: 30 });
  if (limited) return limited;

  const lat = parseCoord(searchParams.get('lat'), 90);
  const lng = parseCoord(searchParams.get('lng'), 180);

  const body: Record<string, unknown> = { textQuery: q, pageSize: PAGE_SIZE, languageCode: 'es', regionCode: 'AR' };
  if (lat != null && lng != null) {
    body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: BIAS_RADIUS_METERS } };
  }

  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify(body),
  }).catch(() => null);

  if (!res || !res.ok) {
    if (res) console.error('[places-search] Google respondió', res.status, await res.text().catch(() => ''));
    return NextResponse.json({ results: [], error: googleErrorMessage(res?.status ?? null) }, { status: 502 });
  }

  const data: { places?: GooglePlace[] } = await res.json().catch(() => ({}));
  const results: PlaceResult[] = (data.places ?? [])
    .filter(p => p.id && p.location?.latitude != null && p.location?.longitude != null)
    .map(p => ({
      placeId: p.id!,
      name: p.displayName?.text ?? '',
      address: p.formattedAddress ?? '',
      lat: p.location!.latitude!,
      lng: p.location!.longitude!,
      category: categoryFromGoogleTypes(p.types),
    }))
    .filter(p => p.name);

  return NextResponse.json({ results });
}
