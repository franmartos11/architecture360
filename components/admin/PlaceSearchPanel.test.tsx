// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import PlaceSearchPanel from './PlaceSearchPanel';
import type { PlaceResult } from '@/lib/google-places';

const CENTER = { lat: -31.4201, lng: -64.1888 };
const HUERTO: PlaceResult = {
  placeId: 'p1', name: 'Colegio Nuestra Señora del Huerto', address: 'Belgrano 269, Córdoba',
  lat: -31.41785, lng: -64.18935, category: 'colegio',
};
const OTRO: PlaceResult = {
  placeId: 'p2', name: 'Escuela Normal', address: 'Av. Colón 100, Córdoba',
  lat: -31.413, lng: -64.19, category: 'colegio',
};

function mockFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function type(value: string) {
  fireEvent.change(screen.getByRole('textbox'), { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
}

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('PlaceSearchPanel', () => {
  it('no busca con menos de 3 caracteres', async () => {
    const fetchMock = mockFetch({ results: [] });
    render(<PlaceSearchPanel center={CENTER} pois={[]} onAdd={vi.fn()} />);
    await type('co');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('busca con debounce y manda lat/lng del center', async () => {
    const fetchMock = mockFetch({ results: [OTRO] });
    render(<PlaceSearchPanel center={CENTER} pois={[]} onAdd={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'colegio' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/admin/places-search?q=colegio');
    expect(url).toContain('lat=-31.4201');
    expect(url).toContain('lng=-64.1888');
    expect(await screen.findByText('Escuela Normal')).toBeTruthy();
    expect(screen.getByText(/km|m$/, { selector: '[data-distance]' })).toBeTruthy();
  });

  it('sin center no manda lat/lng', async () => {
    const fetchMock = mockFetch({ results: [] });
    render(<PlaceSearchPanel center={null} pois={[]} onAdd={vi.fn()} />);
    await type('colegio');
    expect(fetchMock.mock.calls[0][0] as string).not.toContain('lat=');
  });

  it('muestra "Ya agregado" para un POI existente cercano', async () => {
    mockFetch({ results: [HUERTO, OTRO] });
    render(
      <PlaceSearchPanel
        center={CENTER}
        pois={[{ name: 'Colegio Nuestra Señora del Huerto', latitude: -31.4179, longitude: -64.1894 }]}
        onAdd={vi.fn()}
      />,
    );
    await type('colegio');
    expect(await screen.findByText('Ya agregado')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Agregar/ })).toHaveLength(1);
  });

  it('botón deshabilitado mientras agrega', async () => {
    mockFetch({ results: [OTRO] });
    const onAdd = vi.fn(() => new Promise<void>(() => {}));
    render(<PlaceSearchPanel center={CENTER} pois={[]} onAdd={onAdd} />);
    await type('colegio');
    const btn = await screen.findByRole('button', { name: /Agregar/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(OTRO);
    expect(screen.getByRole('button', { name: /Agregando/ })).toHaveProperty('disabled', true);
  });

  it('muestra el error de la ruta', async () => {
    mockFetch({ results: [], error: 'Google Places respondió un error (403).' }, 502);
    render(<PlaceSearchPanel center={CENTER} pois={[]} onAdd={vi.fn()} />);
    await type('colegio');
    expect(await screen.findByText('Google Places respondió un error (403).')).toBeTruthy();
  });

  it('sin resultados', async () => {
    mockFetch({ results: [] });
    render(<PlaceSearchPanel center={CENTER} pois={[]} onAdd={vi.fn()} />);
    await type('xyzxyz');
    expect(await screen.findByText(/Sin resultados en Google para «xyzxyz»/)).toBeTruthy();
  });
});
