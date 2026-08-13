import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminUser } from '@/lib/supabase/require-admin';
import { createAdminClient } from '@/lib/supabase/admin';

import { DEFAULT_PROJECT_SLUG as PROJECT_SLUG } from '@/lib/constants';
const DEFAULTS = { interestRate: 5.5, maxYears: 30, minDownPayment: 20 };

// Pública — la usan las calculadoras del sitio (sin sesión de admin).
export async function GET() {
  const supabase = await createClient();

  const { data: project } = await supabase.from('projects').select('id').eq('slug', PROJECT_SLUG).maybeSingle();
  if (!project) return NextResponse.json(DEFAULTS);

  const { data } = await supabase
    .from('calculator_settings')
    .select('interest_rate, max_years, min_down_payment')
    .eq('project_id', project.id)
    .maybeSingle();

  if (!data) return NextResponse.json(DEFAULTS);

  return NextResponse.json({
    interestRate: Number(data.interest_rate),
    maxYears: data.max_years,
    minDownPayment: Number(data.min_down_payment),
  });
}

// Solo admin — escribe con service_role, así que el chequeo de sesión
// es indispensable acá (no hay policy de UPDATE para anon en la tabla).
export async function POST(request: Request) {
  const user = await requireAdminUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = await request.json();
  const admin = createAdminClient();

  const { data: project, error: projectErr } = await admin
    .from('projects')
    .select('id')
    .eq('slug', PROJECT_SLUG)
    .maybeSingle();
  if (projectErr) return NextResponse.json({ error: projectErr.message }, { status: 500 });
  if (!project) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const { data, error } = await admin
    .from('calculator_settings')
    .upsert({
      project_id: project.id,
      interest_rate: Number(body.interestRate),
      max_years: Number(body.maxYears),
      min_down_payment: Number(body.minDownPayment),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    success: true,
    settings: {
      interestRate: Number(data.interest_rate),
      maxYears: data.max_years,
      minDownPayment: Number(data.min_down_payment),
    },
  });
}
