// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';

// API de Google falsa: solo lo que usa el mapa de entorno.
const onceListeners: { remove: ReturnType<typeof vi.fn> }[] = [];
const markers: FakeMarker[] = [];

class FakeMarker {
  listeners: Record<string, () => void> = {};
  pos: { lat: number; lng: number };
  setPosition = vi.fn((p: { lat: number; lng: number }) => { this.pos = p; });
  constructor(opts: { position: { lat: number; lng: number }; title?: string }) {
    this.pos = opts.position;
    this.title = opts.title;
    markers.push(this);
  }
  title?: string;
  setMap = vi.fn();
  getPosition = () => ({ lat: () => this.pos.lat, lng: () => this.pos.lng });
  setIcon = vi.fn(); setLabel = vi.fn(); setTitle = vi.fn(); setDraggable = vi.fn(); setZIndex = vi.fn();
  addListener = (ev: string, cb: () => void) => { this.listeners[ev] = cb; return { remove: vi.fn() }; };
}

const fakeApi = {
  Map: class {
    addListener = vi.fn(() => ({ remove: vi.fn() }));
    setCenter = vi.fn(); setZoom = vi.fn(); getZoom = vi.fn(() => 12); fitBounds = vi.fn(); panTo = vi.fn();
  },
  Marker: FakeMarker,
  LatLngBounds: class { extend() { return this; } },
  Point: class { constructor(public x: number, public y: number) {} },
  SymbolPath: { CIRCLE: 0 },
  event: {
    addListenerOnce: vi.fn(() => { const l = { remove: vi.fn() }; onceListeners.push(l); return l; }),
  },
};

vi.mock('@/lib/google-maps-loader', () => ({
  GOOGLE_MAPS_PUBLIC_KEY: 'k',
  loadGoogleMaps: () => Promise.resolve(fakeApi),
}));

import LocationOverviewMap, { type OverviewPoi } from './LocationOverviewMap';

const POIS: OverviewPoi[] = [
  { id: 'a', name: 'A', category: 'colegio', latitude: -31.41, longitude: -64.18 },
  { id: 'b', name: 'B', category: 'salud', latitude: -31.42, longitude: -64.19 },
];
const CENTER = { lat: -31.4201, lng: -64.1888 };

afterEach(() => { cleanup(); onceListeners.length = 0; markers.length = 0; });

function props(over: Partial<React.ComponentProps<typeof LocationOverviewMap>> = {}) {
  return {
    center: CENTER, pois: POIS, selectedId: 'a', fitToken: 0,
    onSelectMarker: vi.fn(), onMapClick: vi.fn(), ...over,
  };
}

describe('LocationOverviewMap (Google)', () => {
  it('un nuevo "Ver todos" quita el listener de tope de zoom anterior', async () => {
    const { rerender } = render(<LocationOverviewMap {...props()} />);
    await act(async () => {});
    expect(onceListeners).toHaveLength(1);
    rerender(<LocationOverviewMap {...props({ fitToken: 1 })} />);
    await act(async () => {});
    expect(onceListeners[0].remove).toHaveBeenCalled();
  });

  it('si mover el pin falla, el pin vuelve a su lugar', async () => {
    const onMoveMarker = vi.fn().mockResolvedValue(false);
    render(<LocationOverviewMap {...props({ onMoveMarker })} />);
    await act(async () => {});
    const a = markers.find(m => m.title === 'A')!;
    a.pos = { lat: -31.5, lng: -64.3 }; // arrastrado
    await act(async () => { a.listeners.dragend(); });
    expect(onMoveMarker).toHaveBeenCalledWith('a', -31.5, -64.3);
    expect(a.setPosition).toHaveBeenLastCalledWith({ lat: -31.41, lng: -64.18 });
  });
});
