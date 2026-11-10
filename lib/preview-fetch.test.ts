import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchProjectPreview, clearPreviewFetchCache } from './preview-fetch';

const URL_A = '/api/admin/project/preview?projectId=a';
const ok = (data: unknown) => ({ ok: true, json: () => Promise.resolve(data) });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clearPreviewFetchCache();
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(ok({ project: { name: 'Torre' } })));
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('fetchProjectPreview', () => {
  it('pedidos simultáneos a la misma URL comparten un solo fetch', async () => {
    const [a, b] = await Promise.all([fetchProjectPreview(URL_A), fetchProjectPreview(URL_A)]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it('URLs distintas (otro proyecto) no se mezclan', async () => {
    await Promise.all([fetchProjectPreview(URL_A), fetchProjectPreview('/api/admin/project/preview?projectId=b')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reutiliza la respuesta de hace menos de 2 s y vuelve a pedir después', async () => {
    await fetchProjectPreview(URL_A);
    vi.advanceTimersByTime(1500);
    await fetchProjectPreview(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000); // 2,5 s desde el pedido
    await fetchProjectPreview(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('force no reutiliza nada, ni lo reciente ni lo que está en vuelo', async () => {
    await fetchProjectPreview(URL_A);
    await fetchProjectPreview(URL_A, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // en vuelo: un forzado no se cuelga de un pedido que pudo salir antes del cambio
    clearPreviewFetchCache();
    fetchMock.mockClear();
    await Promise.all([fetchProjectPreview(URL_A), fetchProjectPreview(URL_A, { force: true })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('un pedido forzado deja su respuesta como la reciente', async () => {
    fetchMock.mockResolvedValueOnce(ok({ project: { name: 'viejo' } }));
    await fetchProjectPreview(URL_A);
    fetchMock.mockResolvedValueOnce(ok({ project: { name: 'nuevo' } }));
    await fetchProjectPreview(URL_A, { force: true });
    expect(await fetchProjectPreview(URL_A)).toEqual({ project: { name: 'nuevo' } });
  });

  it('una respuesta con error no se recuerda: el siguiente pedido vuelve a la red', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'No autorizado' }) });
    expect(await fetchProjectPreview(URL_A)).toEqual({ error: 'No autorizado' });
    await fetchProjectPreview(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('si el fetch falla, rechaza y no deja el pedido colgado', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    await expect(fetchProjectPreview(URL_A)).rejects.toThrow('network');
    await fetchProjectPreview(URL_A);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('cada llamador recibe su propia copia: mutar una no afecta a la otra', async () => {
    const [a, b] = await Promise.all([fetchProjectPreview<{ project: { name: string } }>(URL_A), fetchProjectPreview<{ project: { name: string } }>(URL_A)]);
    a.project.name = 'mutado';
    expect(b.project.name).toBe('Torre');
    const c = await fetchProjectPreview<{ project: { name: string } }>(URL_A);
    expect(c.project.name).toBe('Torre');
  });
});
