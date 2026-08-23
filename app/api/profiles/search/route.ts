import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const RESULT_LIMIT = 5;

// Resultados en vivo para el buscador de la nav — /directorio sigue
// siendo la búsqueda completa con filtros, esto es solo el atajo rápido.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (!q) return NextResponse.json({ profiles: [] });

  // Dos queries separadas en vez de un .or() con el texto interpolado a
  // mano — evita depender de escapar comas/paréntesis del filtro OR de
  // PostgREST por una búsqueda de texto libre.
  const supabase = await createClient();
  const select = 'handle, display_name, avatar_image, account_type';
  const [{ data: byName }, { data: byHandle }] = await Promise.all([
    supabase.from('profiles').select(select).ilike('display_name', `%${q}%`).limit(RESULT_LIMIT),
    supabase.from('profiles').select(select).ilike('handle', `%${q}%`).limit(RESULT_LIMIT),
  ]);

  const byHandleKey = new Map([...(byName ?? []), ...(byHandle ?? [])].map(p => [p.handle, p]));
  const profiles = Array.from(byHandleKey.values()).slice(0, RESULT_LIMIT);
  return NextResponse.json({ profiles });
}
