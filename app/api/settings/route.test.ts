import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
  resolveActiveProjectId: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import {
  requireProjectAccess,
  resolveRequestedProjectId,
  resolveActiveProjectId,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { GET, POST } from './route';
import { newPlan } from '@/lib/financing';

const DEFAULTS = { interestRate: 5.5, maxYears: 30, minDownPayment: 20, financingPlans: [] };

function get(url: string) {
  return new Request(url);
}

describe('GET /api/settings', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(resolveActiveProjectId).mockReset();
  });

  it('?projectSlug=... con proyecto y settings guardados: devuelve la config del proyecto', async () => {
    const supabase = mockSupabase({
      results: [
        { data: { id: 'project-1' } }, // .from('projects') por slug
        { data: { interest_rate: 6.5, max_years: 25, min_down_payment: 15 } }, // calculator_settings
      ],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/settings?projectSlug=torre'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ interestRate: 6.5, maxYears: 25, minDownPayment: 15, financingPlans: [] });
  });

  it('?projectSlug=... sin proyecto encontrado: DEFAULTS, no consulta calculator_settings', async () => {
    const supabase = mockSupabase({ results: [{ data: null }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/settings?projectSlug=no-existe'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
  });

  it('proyecto sin settings guardados todavía: DEFAULTS', async () => {
    const supabase = mockSupabase({
      results: [{ data: { id: 'project-1' } }, { data: null }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/settings?projectSlug=torre'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
  });

  it('sin projectSlug: resuelve por cookie de proyecto activo (panel admin)', async () => {
    vi.mocked(resolveActiveProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { interest_rate: 5.5, max_years: 30, min_down_payment: 20 } }],
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/settings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
  });

  it('sin projectSlug y sin proyecto activo: DEFAULTS, no toca la base', async () => {
    vi.mocked(resolveActiveProjectId).mockResolvedValue(null);
    const supabase = mockSupabase({ results: [] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const res = await GET(get('http://localhost/api/settings'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DEFAULTS);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('POST /api/settings', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset();
  });

  function req(body: unknown) {
    return jsonRequest('http://localhost/api/settings', body);
  }

  it('proyecto no resuelto (sin cookie ni ?projectId): 404, no chequea acceso', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);

    const res = await POST(req({ interestRate: 5, maxYears: 20, minDownPayment: 10 }));
    expect(res.status).toBe(404);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('no es dueño del proyecto: 401, no actualiza', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(req({ interestRate: 5, maxYears: 20, minDownPayment: 10 }));
    expect(res.status).toBe(401);
  });

  it('body inválido (interestRate fuera de rango): 400', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ interestRate: 500, maxYears: 20, minDownPayment: 10 }));
    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('error de la base al guardar: 500', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: null, error: { message: 'upsert failed' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ interestRate: 5, maxYears: 20, minDownPayment: 10 }));
    expect(res.status).toBe(500);
  });

  it('feliz: el dueño del proyecto actualiza la config', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('project-1');
    const supabase = mockSupabase({
      results: [{ data: { interest_rate: 7, max_years: 15, min_down_payment: 25 } }],
    });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(req({ interestRate: 7, maxYears: 15, minDownPayment: 25 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      settings: { interestRate: 7, maxYears: 15, minDownPayment: 25, financingPlans: [] },
    });
  });
});

describe('/api/settings — planes de pago en pozo', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveRequestedProjectId).mockReset().mockResolvedValue('project-1');
  });
  const req = (body: unknown) => jsonRequest('http://localhost/api/settings', body);

  it('GET devuelve los planes válidos y descarta los rotos', async () => {
    const plan = newPlan();
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [
      { data: { id: 'project-1' } },
      { data: { interest_rate: 6.5, max_years: 25, min_down_payment: 15, financing_plans: [plan, { ...plan, downPaymentPct: 99 }] } },
    ] }) as never);

    const res = await GET(new Request('http://localhost/api/settings?projectSlug=torre'));
    expect((await res.json()).financingPlans).toEqual([plan]);
  });

  it('POST solo con planes: guarda financing_plans y no pisa el hipotecario', async () => {
    const plan = newPlan();
    const supabase = mockSupabase({ results: [{ data: { interest_rate: 6.5, max_years: 25, min_down_payment: 15, financing_plans: [plan] } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' } } as never);

    const res = await POST(req({ financingPlans: [plan] }));

    expect(res.status).toBe(200);
    const upserted = supabase.from.mock.results[0].value.upsert.mock.calls[0][0];
    expect(upserted).toEqual({ project_id: 'project-1', financing_plans: [plan] });
    expect((await res.json()).settings.financingPlans).toEqual([plan]);
  });

  it('POST solo con el hipotecario: no toca los planes', async () => {
    const supabase = mockSupabase({ results: [{ data: { interest_rate: 7, max_years: 15, min_down_payment: 25, financing_plans: [] } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' } } as never);

    await POST(req({ interestRate: 7, maxYears: 15, minDownPayment: 25 }));

    expect(supabase.from.mock.results[0].value.upsert.mock.calls[0][0]).not.toHaveProperty('financing_plans');
  });

  it('POST con un plan que suma más de 100%: 400 sin guardar', async () => {
    const supabase = mockSupabase({ results: [] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' } } as never);

    const res = await POST(req({ financingPlans: [{ ...newPlan(), downPaymentPct: 80 }] }));

    expect(res.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('POST vacío: 400', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: mockSupabase({ results: [] }), user: { id: 'u' } } as never);
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it('GET con error de la base (p. ej. falta la columna): lo registra y devuelve los valores por defecto', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(createClient).mockResolvedValue(mockSupabase({ results: [
      { data: { id: 'project-1' } },
      { data: null, error: { code: '42703', message: 'column financing_plans does not exist' } },
    ] }) as never);
    const res = await GET(new Request('http://localhost/api/settings?projectSlug=torre'));
    expect((await res.json()).financingPlans).toEqual([]);
    expect(spy).toHaveBeenCalled();
  });
});
