import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireProjectAccess, resolveRequestedProjectId, resolveActiveProjectId } from '@/lib/supabase/require-project-access';
import { parseJsonBody } from '@/lib/api-validate';
import { serverError } from '@/lib/api-errors';
import { financingPlansSchema, parseStoredPlans } from '@/lib/financing';

const DEFAULTS = { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [] };

// Cualquier subconjunto: se actualiza solo lo que llega (guardar el simulador
// hipotecario no pisa los planes de pago en pozo y viceversa).
const calculatorSettingsSchema = z.object({
  interestRate: z.number().min(0).max(100).optional(),
  maxYears: z.number().int().min(1).max(100).optional(),
  minDownPayment: z.number().min(0).max(100).optional(),
  financingPlans: financingPlansSchema.optional(),
}).refine(b => Object.values(b).some(v => v !== undefined), { message: 'Nada para guardar' });

const SETTINGS_COLUMNS = 'interest_rate, max_years, min_down_payment, financing_plans';

type SettingsRow = { interest_rate: number | string; max_years: number; min_down_payment: number | string; financing_plans?: unknown };

function toSettings(row: SettingsRow) {
  return {
    interestRate: Number(row.interest_rate),
    maxYears: row.max_years,
    minDownPayment: Number(row.min_down_payment),
    financingPlans: parseStoredPlans(row.financing_plans),
  };
}

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

  const { data, error } = await supabase
    .from('calculator_settings')
    .select(SETTINGS_COLUMNS)
    .eq('project_id', projectId)
    .maybeSingle();

  // Un error (p. ej. la base sin la columna financing_plans) no puede pasar
  // por "proyecto sin configuración" sin dejar rastro.
  if (error) console.error('[settings] no se pudo leer la calculadora', error);
  if (!data) return NextResponse.json(DEFAULTS);

  return NextResponse.json(toSettings(data as SettingsRow));
}

// Solo el dueño del proyecto activo (mismo patrón que el resto del admin).
export async function POST(request: Request) {
  const projectId = await resolveRequestedProjectId(request);
  if (!projectId) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 });

  const access = await requireProjectAccess(projectId);
  if (!access) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const { supabase } = access;

  const parsed = await parseJsonBody(request, calculatorSettingsSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const row: Record<string, unknown> = { project_id: projectId };
  if (body.interestRate !== undefined) row.interest_rate = body.interestRate;
  if (body.maxYears !== undefined) row.max_years = body.maxYears;
  if (body.minDownPayment !== undefined) row.min_down_payment = body.minDownPayment;
  if (body.financingPlans !== undefined) row.financing_plans = body.financingPlans;

  const { data, error } = await supabase
    .from('calculator_settings')
    .upsert(row)
    .select(SETTINGS_COLUMNS)
    .single();

  if (error) return serverError(error);
  return NextResponse.json({ success: true, settings: toSettings(data as SettingsRow) });
}
