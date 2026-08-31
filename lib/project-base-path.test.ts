import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./project-subdomain', () => ({ resolveProjectSlugFromHost: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';
import { resolveProjectSlugFromHost } from './project-subdomain';
import { getProjectBasePath } from './project-base-path';

function mockHost(host: string | null) {
  vi.mocked(headers).mockResolvedValue({ get: () => host } as never);
}

describe('getProjectBasePath', () => {
  beforeEach(() => {
    vi.mocked(headers).mockReset();
    vi.mocked(resolveProjectSlugFromHost).mockReset();
  });

  it('vacío cuando el visitante ya está en el subdominio de este proyecto', async () => {
    mockHost('torre-del-mar.midominio.com');
    vi.mocked(resolveProjectSlugFromHost).mockReturnValue('torre-del-mar');
    expect(await getProjectBasePath('torre-del-mar')).toBe('');
  });

  it('antepone /proyecto/[slug] cuando el host no es el subdominio de este proyecto', async () => {
    mockHost('panel.midominio.com');
    vi.mocked(resolveProjectSlugFromHost).mockReturnValue(null);
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
  });

  it('antepone /proyecto/[slug] cuando el host resuelve a OTRO proyecto', async () => {
    mockHost('otro-proyecto.midominio.com');
    vi.mocked(resolveProjectSlugFromHost).mockReturnValue('otro-proyecto');
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
  });

  it('antepone /proyecto/[slug] cuando no hay header Host', async () => {
    mockHost(null);
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
    expect(resolveProjectSlugFromHost).not.toHaveBeenCalled();
  });
});
