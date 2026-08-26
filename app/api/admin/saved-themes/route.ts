import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/sanitize';

// Temas guardados — cuenta-scoped (owner_id): guardar la combinación
// vigente de un proyecto (preset + tipografía) y poder aplicarla después
// a cualquier otro proyecto del mismo dueño. Ver lib/theme-presets.ts.
export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('saved_themes').select('*').eq('owner_id', user.id).order('created_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ themes: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const name = sanitizeText(body.name, 100);
  const config = body.config;
  if (!name) return NextResponse.json({ error: 'Falta el nombre del tema' }, { status: 400 });
  if (!config || typeof config !== 'object') return NextResponse.json({ error: 'Falta la configuración del tema' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_themes')
    .insert({ owner_id: user.id, name, config })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ theme: data });
}
