// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/admin' }));

import { useProjectCompleteness } from '@/hooks/useProjectCompleteness';
import { PublishStateProvider, usePublishState } from '@/lib/publish-state-context';

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(
    PublishStateProvider,
    { projectId: 'p1', slug: 'mi-proyecto', initialPublished: false, projectType: 'edificio', saleMode: 'venta' },
    children
  );
}

function previewResponse(project: unknown) {
  return { json: () => Promise.resolve({ project }) };
}

const FULL_PROJECT = {
  description: 'Un proyecto con todo cargado',
  beforeAfter: [{}],
  processGallery: [{}],
  collaborators: [{}],
  amenities: [{}],
  pointsOfInterest: [{ image: 'x.png' }],
  units: [{}],
  aerialSlides: [{}],
  sectionConfig: null,
};

const EMPTY_PROJECT = {
  description: '',
  beforeAfter: [],
  processGallery: [],
  collaborators: [],
  amenities: [],
  pointsOfInterest: [],
  units: [],
  aerialSlides: [],
  sectionConfig: null,
};

describe('useProjectCompleteness', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('arranca en loading=true, missing=[]', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(null)));
    const { result } = renderHook(() => useProjectCompleteness(), { wrapper });
    expect(result.current.loading).toBe(true);
    expect(result.current.missing).toEqual([]);
  });

  it('proyecto completo: missing queda vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(FULL_PROJECT)));
    const { result } = renderHook(() => useProjectCompleteness(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('proyecto vacío: lista las secciones habilitadas y disponibles sin contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(EMPTY_PROJECT)));
    const { result } = renderHook(() => useProjectCompleteness(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const keys = result.current.missing.map(m => m.key);
    expect(keys).toContain('about');
    expect(keys).toContain('typologies');
    // 'edificio'+'venta' no es showcase → before_after/process ni siquiera están
    // disponibles, así que no deberían aparecer como "faltantes" pese a estar vacíos.
    expect(keys).not.toContain('before_after');
    expect(keys).not.toContain('process');
  });

  it('sin data.project (null): no rompe, missing vacío, loading termina en false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(null)));
    const { result } = renderHook(() => useProjectCompleteness(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('fetch que tira: no rompe, loading termina en false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { result } = renderHook(() => useProjectCompleteness(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('re-render sin cambios no vuelve a pedir el preview (sin loop de fetch)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(previewResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderHook(() => useProjectCompleteness(), { wrapper });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender();
    rerender();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('usePublishState', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('borrador: "Ver sitio" va a la vista previa y lista lo obligatorio que falta', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse({ ...EMPTY_PROJECT, name: 'Torre', buildings: [] })));
    const { result } = renderHook(() => usePublishState(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.published).toBe(false);
    expect(result.current.siteHref).toBe('/proyecto/mi-proyecto');
    expect(result.current.canPublish).toBe(false);
    expect(result.current.missingRequired).toHaveLength(2); // imagen + unidades
  });

  it('publicar con éxito pasa a publicado', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(previewResponse({ ...FULL_PROJECT, name: 'Torre', buildings: [{}] }))
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePublishState(), { wrapper });
    await waitFor(() => expect(result.current.canPublish).toBe(true));
    const r = await result.current.setPublished(true);
    expect(r.ok).toBe(true);
    await waitFor(() => expect(result.current.published).toBe(true));
  });

  it('publicar rechazado por el server: devuelve el error y sigue en borrador', async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'PATCH'
        ? Promise.resolve({ ok: false, status: 422, json: () => Promise.resolve({ error: 'Todavía no se puede publicar.' }) })
        : Promise.resolve(previewResponse(EMPTY_PROJECT)));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePublishState(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const r = await result.current.setPublished(true);
    expect(r).toEqual({ ok: false, error: 'Todavía no se puede publicar.' });
    expect(result.current.published).toBe(false);
  });
});
