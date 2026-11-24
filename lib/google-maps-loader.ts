'use client';

// Carga el script de Google Maps JS API una sola vez por sesión, sin
// depender de @googlemaps/js-api-loader ni de ninguna librería nueva — es
// un <script> y un promise cacheado. Requiere
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (clave pública, restringida por dominio);
// sin ella los mapas del admin muestran <MapsKeyMissing />.

// ── Tipado mínimo (solo lo que usan los mapas del admin) ────────────
export interface GLatLngLiteral { lat: number; lng: number }
interface GLatLng { lat(): number; lng(): number }
export interface GPoint { x: number; y: number }

export interface GMapsEventListener { remove(): void }

export interface GLatLngBounds {
  extend(latLng: GLatLngLiteral): GLatLngBounds;
}

export interface GMap {
  addListener(event: 'click', cb: (e: { latLng: GLatLng | null }) => void): GMapsEventListener;
  addListener(event: 'idle', cb: () => void): GMapsEventListener;
  panTo(latLng: GLatLngLiteral): void;
  setCenter(latLng: GLatLngLiteral): void;
  setZoom(zoom: number): void;
  getZoom(): number | undefined;
  fitBounds(bounds: GLatLngBounds, padding?: number): void;
}

export interface GSymbol {
  path: string | number;
  fillColor?: string;
  fillOpacity?: number;
  strokeColor?: string;
  strokeWeight?: number;
  scale?: number;
  anchor?: GPoint;
  labelOrigin?: GPoint;
}

export interface GMarkerLabel {
  text: string;
  color?: string;
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
}

export interface GMarkerOptions {
  position: GLatLngLiteral;
  map: GMap;
  draggable?: boolean;
  icon?: GSymbol;
  label?: GMarkerLabel;
  title?: string;
  zIndex?: number;
}

export interface GMarker {
  setPosition(latLng: GLatLngLiteral): void;
  setMap(map: GMap | null): void;
  getPosition(): GLatLng | null;
  setIcon(icon: GSymbol): void;
  setLabel(label: GMarkerLabel): void;
  setTitle(title: string): void;
  setDraggable(draggable: boolean): void;
  setZIndex(zIndex: number): void;
  addListener(event: 'dragend' | 'click', cb: () => void): GMapsEventListener;
}

export interface GoogleMapsApi {
  Map: new (el: HTMLElement, opts: {
    center: GLatLngLiteral;
    zoom: number;
    disableDefaultUI?: boolean;
    zoomControl?: boolean;
    streetViewControl?: boolean;
    mapTypeControl?: boolean;
    fullscreenControl?: boolean;
    clickableIcons?: boolean;
    gestureHandling?: 'greedy' | 'cooperative' | 'auto' | 'none';
  }) => GMap;
  Marker: new (opts: GMarkerOptions) => GMarker;
  LatLngBounds: new () => GLatLngBounds;
  Point: new (x: number, y: number) => GPoint;
  SymbolPath: { CIRCLE: number };
  event: { addListenerOnce(instance: GMap, event: 'idle', cb: () => void): GMapsEventListener };
}

type WindowWithGoogle = Window & { google?: { maps?: GoogleMapsApi } };

export const GOOGLE_MAPS_PUBLIC_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

const READY_CALLBACK = '__atriumGoogleMapsReady';

let cached: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(apiKey: string = GOOGLE_MAPS_PUBLIC_KEY): Promise<GoogleMapsApi> {
  if (cached) return cached;
  cached = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('loadGoogleMaps solo corre en el cliente'));
      return;
    }
    const existing = (window as WindowWithGoogle).google?.maps;
    if (existing?.Map) { resolve(existing); return; }

    // Con loading=async el onload del script llega con un google.maps de
    // bootstrap (sin Map/Marker todavía): hay que esperar al callback.
    const w = window as unknown as Record<string, unknown>;
    w[READY_CALLBACK] = () => {
      delete w[READY_CALLBACK];
      const api = (window as WindowWithGoogle).google?.maps;
      if (api?.Map) resolve(api);
      else { cached = null; reject(new Error('google.maps no quedó disponible tras cargar el script')); }
    };

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${READY_CALLBACK}`;
    script.async = true;
    script.onerror = () => { cached = null; delete w[READY_CALLBACK]; reject(new Error('No se pudo cargar Google Maps')); };
    document.head.appendChild(script);
  });
  return cached;
}
