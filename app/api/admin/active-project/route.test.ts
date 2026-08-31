import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  ACTIVE_PROJECT_COOKIE: 'active_project_id',
}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { requireProjectAccess } from '@/lib/supabase/require-project-access';
import { cookies } from 'next/headers';
import { jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

describe('POST /api/admin/active-project', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(cookies).mockReset();
  });

  it('falta projectId: 400', async () => {
    const res = await POST(jsonRequest('http://localhost/api/admin/active-project', {}));
    expect(res.status).toBe(400);
    expect(requireProjectAccess).not.toHaveBeenCalled();
  });

  it('sin acceso al proyecto: 401, sin tocar la cookie', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue(null);
    const setSpy = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ set: setSpy } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/active-project', { projectId: 'project-1' }));
    expect(res.status).toBe(401);
    expect(setSpy).not.toHaveBeenCalled();
  });

  it('con acceso: setea la cookie active_project_id y devuelve success', async () => {
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase: {}, user: { id: 'user-1' } } as never);
    const setSpy = vi.fn();
    vi.mocked(cookies).mockResolvedValue({ set: setSpy } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/active-project', { projectId: 'project-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(setSpy).toHaveBeenCalledWith(
      'active_project_id',
      'project-1',
      expect.objectContaining({ path: '/', httpOnly: true, sameSite: 'lax' })
    );
  });
});
