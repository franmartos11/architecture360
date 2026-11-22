import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));

import { addDomain, VercelDomainError } from './vercel-domains';

// Respuesta mínima de la API de Vercel.
function res(status: number, body: unknown = {}) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv('VERCEL_TOKEN', 't');
  vi.stubEnv('VERCEL_PROJECT_ID', 'prj_1');
  vi.stubEnv('VERCEL_TEAM_ID', '');
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('addDomain', () => {
  it('dominio libre: consulta, no está en el proyecto (404) y lo agrega', async () => {
    fetchMock
      .mockResolvedValueOnce(res(404, { error: { code: 'not_found', message: 'no' } }))
      .mockResolvedValueOnce(res(200, { name: 'www.torre.com' }));

    await addDomain('www.torre.com');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/v9/projects/prj_1/domains/www.torre.com');
    expect(fetchMock.mock.calls[1][0]).toContain('/v10/projects/prj_1/domains');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('el dominio ya está en este proyecto de Vercel (plataforma, alias, otro cliente): lo rechaza sin agregarlo', async () => {
    fetchMock.mockResolvedValueOnce(res(200, { name: 'www.plataforma.com', verified: true }));

    const err = await addDomain('www.plataforma.com').catch(e => e);

    expect(err).toBeInstanceOf(VercelDomainError);
    expect(err.code).toBe('domain_on_platform');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lo tiene otro proyecto de Vercel (409 domain_already_in_use): el error sube, no se da por agregado', async () => {
    fetchMock
      .mockResolvedValueOnce(res(404, { error: { code: 'not_found', message: 'no' } }))
      .mockResolvedValueOnce(res(409, { error: { code: 'domain_already_in_use', message: 'in use' } }));

    const err = await addDomain('www.torre.com').catch(e => e);

    expect(err).toBeInstanceOf(VercelDomainError);
    expect(err.code).toBe('domain_already_in_use');
  });

  it('si la consulta previa falla por otra cosa (500), no intenta agregarlo', async () => {
    fetchMock.mockResolvedValueOnce(res(500, { error: { code: 'internal', message: 'boom' } }));

    await expect(addDomain('www.torre.com')).rejects.toBeInstanceOf(VercelDomainError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
