import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveRequestedProjectId: vi.fn(),
}));

import { requireProjectAccess, resolveRequestedProjectId } from '@/lib/supabase/require-project-access';
import { mockSupabase } from '@/lib/test-helpers/supabase-mock';
import { GET } from './route';

const URL = 'http://localhost/api/admin/project/immersive-summary';

beforeEach(() => {
  vi.mocked(requireProjectAccess).mockReset();
  vi.mocked(resolveRequestedProjectId).mockReset();
});

describe('GET /api/admin/project/immersive-summary', () => {
  it('sin proyecto: 404', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue(null);
    expect((await GET(new Request(URL))).status).toBe(404);
  });

  it('sin acceso: 401', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('p1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    expect((await GET(new Request(URL))).status).toBe(401);
  });

  it('cuenta vistas con hotspots y unidades con recorrido', async () => {
    vi.mocked(resolveRequestedProjectId).mockResolvedValue('p1');
    const supabase = mockSupabase({ results: [
      { data: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] }, // aerial_slides
      { count: 48 },                                        // units
      { count: 11 },                                        // units con tour_data
      { data: [{ slide_id: 's1' }, { slide_id: 's1' }, { slide_id: 's2' }] }, // hotspots
    ] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'u' } } as never);
    const res = await GET(new Request(URL));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ slides: 3, slidesWithHotspots: 2, units: 48, unitsWithTour: 11 });
  });
});
