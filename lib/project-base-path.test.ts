import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./project-host', () => ({ resolveProjectSlugForHost: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';
import { resolveProjectSlugForHost } from './project-host';
import { getProjectBasePath } from './project-base-path';

function mockHost(host: string | null) {
  vi.mocked(headers).mockResolvedValue({ get: () => host } as never);
}

describe('getProjectBasePath', () => {
  beforeEach(() => {
    vi.mocked(headers).mockReset();
    vi.mocked(resolveProjectSlugForHost).mockReset();
  });

  it('vacío cuando el visitante ya está en el subdominio de este proyecto', async () => {
    mockHost('torre-del-mar.midominio.com');
    vi.mocked(resolveProjectSlugForHost).mockResolvedValue('torre-del-mar');
    expect(await getProjectBasePath('torre-del-mar')).toBe('');
  });

  it('vacío también en el dominio propio del cliente', async () => {
    mockHost('www.torredelmar.com');
    vi.mocked(resolveProjectSlugForHost).mockResolvedValue('torre-del-mar');
    expect(await getProjectBasePath('torre-del-mar')).toBe('');
  });

  it('antepone /proyecto/[slug] cuando el host no es el subdominio de este proyecto', async () => {
    mockHost('panel.midominio.com');
    vi.mocked(resolveProjectSlugForHost).mockResolvedValue(null);
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
  });

  it('antepone /proyecto/[slug] cuando el host resuelve a OTRO proyecto', async () => {
    mockHost('otro-proyecto.midominio.com');
    vi.mocked(resolveProjectSlugForHost).mockResolvedValue('otro-proyecto');
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
  });

  it('antepone /proyecto/[slug] cuando no hay header Host', async () => {
    mockHost(null);
    expect(await getProjectBasePath('torre-del-mar')).toBe('/proyecto/torre-del-mar');
    expect(resolveProjectSlugForHost).not.toHaveBeenCalled();
  });
});
