import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createClient } from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/sanitize';
import { readJsonObject, validateJson } from '@/lib/api-validate';
import { themeConfigSchema } from '@/lib/project-schemas';
import { serverError } from '@/lib/api-errors';

// Temas guardados — cuenta-scoped (owner_id): guardar la combinación
// vigente de un proyecto (preset + tipografía) y poder aplicarla después
// a cualquier otro proyecto del mismo dueño. Ver lib/theme-presets.ts.
export async function GET() {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('saved_themes').select('*').eq('owner_id', user.id).order('created_at');
  if (error) return serverError(error);
  return NextResponse.json({ themes: data ?? [] });
}

export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const raw = await readJsonObject(request);
  if ('error' in raw) return raw.error;
  const body = raw.data;
  const name = sanitizeText(body.name, 100);
  if (!name) return NextResponse.json({ error: 'Falta el nombre del tema' }, { status: 400 });
  if (!body.config || typeof body.config !== 'object') return NextResponse.json({ error: 'Falta la configuración del tema' }, { status: 400 });
  // Mismo schema que el tema del proyecto: un tema guardado se aplica después a
  // cualquier proyecto del dueño, así que no puede traer valores que el proyecto rechazaría.
  const parsedConfig = validateJson(body.config, themeConfigSchema);
  if ('error' in parsedConfig) return parsedConfig.error;
  const config = parsedConfig.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_themes')
    .insert({ owner_id: user.id, name, config })
    .select()
    .single();
  if (error) return serverError(error);

  return NextResponse.json({ theme: data });
}
