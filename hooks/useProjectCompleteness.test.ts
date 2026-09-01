// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useProjectCompleteness } from './useProjectCompleteness';
import { getProjectTypeConfig } from '@/lib/project-types';

const typeConfig = getProjectTypeConfig('edificio', 'venta');

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
    const { result } = renderHook(() => useProjectCompleteness(typeConfig));
    expect(result.current.loading).toBe(true);
    expect(result.current.missing).toEqual([]);
  });

  it('proyecto completo: missing queda vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(FULL_PROJECT)));
    const { result } = renderHook(() => useProjectCompleteness(typeConfig));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('proyecto vacío: lista las secciones habilitadas y disponibles sin contenido', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(previewResponse(EMPTY_PROJECT)));
    const { result } = renderHook(() => useProjectCompleteness(typeConfig));
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
    const { result } = renderHook(() => useProjectCompleteness(typeConfig));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('fetch que tira: no rompe, loading termina en false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const { result } = renderHook(() => useProjectCompleteness(typeConfig));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.missing).toEqual([]);
  });

  it('el efecto solo depende de saleMode/buildingLabel/unitLabel — otro cambio no refetchea', async () => {
    const fetchMock = vi.fn().mockResolvedValue(previewResponse(null));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = renderHook((tc) => useProjectCompleteness(tc), { initialProps: typeConfig });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // mismo saleMode/buildingLabel/unitLabel, pero un objeto distinto con otro flag cambiado
    rerender({ ...typeConfig, showPrice: !typeConfig.showPrice });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 'loteo'+'venta' tiene buildingLabel distinto ("Etapa") → el efecto sí debe re-disparar
    rerender(getProjectTypeConfig('loteo', 'venta'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
