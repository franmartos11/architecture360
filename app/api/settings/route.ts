import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess, resolveRequestedProjectId, resolveActiveProjectId } from '@/lib/supabase/require-project-access';

const DEFAULTS = { interestRate: 5.5, maxYears: 30, minDownPayment: 20 };

// Pública — la usan las calculadoras del sitio (sin sesión de admin) con
// ?projectSlug= explícito, y el panel de admin (con sesión, sin slug) que
// necesita el proyecto activo — de ahí resuelve por cookie en vez de slug.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('projectSlug');

  const supabase = await createClient();

  let projectId: string | null;
  if (slug) {
    const { data: project } = await supabase.from('projects').select('id').eq('slug', slug).maybeSingle();
    projectId = project?.id ?? null;
  } else {
    projectId = await resolveActiveProjectId();
  }
  if (!projectId) return NextResponse.json(DEFAULTS);

  const { data } = await supabase
    .from('calculator_settings')
    .select('interest_rate, max_years, min_down_payment')
    .eq('project_id', projectId)
    .maybeSingle();

  if (!data) return NextResponse.json(DEFAULTS);

  return NextResponse.json({
    interestRate: Number(data.interest_rate),
    maxYears: data.max_years,
    minDownPayment: Number(data.min_down_payment),
  });
}

// Solo el dueño del proyecto activo (mismo patrón que el resto del admin).
export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const body = await request.json();

  const { data, error } = await supabase
    .from('calculator_settings')
    .upsert({
      project_id: projectId,
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
