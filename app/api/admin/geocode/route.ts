import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';

const RESULT_LIMIT = 5;

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

// Proxy a Nominatim (buscador gratuito de OpenStreetMap) para el picker de
// ubicación del admin — server-side porque Nominatim exige un User-Agent
// identificando la app, algo que no se puede setear desde fetch() en el
// browser. No requiere API key ni billing, a diferencia de Google Places.
export async function GET(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ results: [] });

  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=${RESULT_LIMIT}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': '360Proyects-admin-location-picker/1.0' },
  });
  if (!res.ok) return NextResponse.json({ results: [] });

  const data: NominatimResult[] = await res.json().catch(() => []);
  const results = data.map(d => ({ label: d.display_name, lat: Number(d.lat), lng: Number(d.lon) }));
  return NextResponse.json({ results });
}
