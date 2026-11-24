import type { SupabaseClient } from '@supabase/supabase-js';
import { parseStoredPlans, type FinancingPlan } from '@/lib/financing';

/**
 * Planes de pago en pozo de un proyecto, leídos en el servidor (ficha PDF).
 * Sin fila o con error devuelve [] (un error queda logueado: no puede pasar
 * por "proyecto sin planes" sin rastro).
 */
export async function readFinancingPlans(supabase: SupabaseClient, projectId: string): Promise<FinancingPlan[]> {
  const { data, error } = await supabase
    .from('calculator_settings')
    .select('financing_plans')
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) console.error('[settings] no se pudo leer la calculadora', error);
  return parseStoredPlans((data as { financing_plans?: unknown } | null)?.financing_plans);
}
