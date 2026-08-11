import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Único proyecto servido hoy (ver DEFAULT_PROJECT_SLUG) — igual que el
// resto de las rutas API, que también lo hardcodean.
const PROJECT_SLUG = 'demo';

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name || !body.email || !body.phone) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();

  // Insert público (policy RLS "public insert leads") — sin .select()
  // a propósito: no hay policy de SELECT para anon en leads, así que
  // pedir la fila de vuelta con RETURNING la filtraría a cero filas.
  const { error } = await supabase.from('leads').insert({
    project_id: project?.id ?? null,
    name: body.name,
    email: body.email,
    phone: body.phone,
    message: body.message ?? null,
    unit_name: body.unitName ?? null,
    method: body.method ?? null,
    source: body.source ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
