import { describe, it, expect, vi, afterEach } from 'vitest';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { newPlan } from '@/lib/financing';
import { readFinancingPlans } from './financing-server';

const plan = (id: string) => ({ ...newPlan(), id, name: `Plan ${id}` });

describe('readFinancingPlans', () => {
  afterEach(() => vi.restoreAllMocks());

  it('devuelve los planes válidos y descarta los rotos', async () => {
    const supabase = mockSupabase({ results: [{ data: { financing_plans: [plan('a'), { id: 'x' }, plan('b')] } }] });
    const plans = await readFinancingPlans(supabase as never, 'p1');
    expect(plans.map(p => p.id)).toEqual(['a', 'b']);
  });

  it('sin fila: []', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    expect(await readFinancingPlans(supabase as never, 'p1')).toEqual([]);
  });

  it('error de la base: [] y log', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const supabase = mockSupabase({ results: [{ data: null, error: { code: '42703' } }] });
    expect(await readFinancingPlans(supabase as never, 'p1')).toEqual([]);
    expect(err).toHaveBeenCalled();
  });
});
