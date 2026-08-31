'use client';

// Carga el script de Google Maps JS API una sola vez por sesión, sin
// depender de @googlemaps/js-api-loader ni de ninguna librería nueva — es
// un <script> y un promise cacheado. Solo se usa cuando
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY está seteada; si no, el picker sigue con
// el mapa de OpenStreetMap/leaflet de siempre.

// ── Tipado mínimo (solo lo que usa el picker) ──────────────────────
export interface GLatLngLiteral { lat: number; lng: number }
interface GLatLng { lat(): number; lng(): number }

export interface GMap {
  addListener(event: 'click', cb: (e: { latLng: GLatLng | null }) => void): void;
  panTo(latLng: GLatLngLiteral): void;
  setZoom(zoom: number): void;
}
export interface GMarker {
  setPosition(latLng: GLatLngLiteral): void;
  setMap(map: GMap | null): void;
  getPosition(): GLatLng | null;
  addListener(event: 'dragend', cb: () => void): void;
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
  }) => GMap;
  Marker: new (opts: { position: GLatLngLiteral; map: GMap; draggable?: boolean }) => GMarker;
}

type WindowWithGoogle = Window & { google?: { maps?: GoogleMapsApi } };

let cached: Promise<GoogleMapsApi> | null = null;

export function loadGoogleMaps(apiKey: string): Promise<GoogleMapsApi> {
  if (cached) return cached;
  cached = new Promise<GoogleMapsApi>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('loadGoogleMaps solo corre en el cliente'));
      return;
    }
    const existing = (window as WindowWithGoogle).google?.maps;
    if (existing) { resolve(existing); return; }

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async`;
    script.async = true;
    script.onload = () => {
      const api = (window as WindowWithGoogle).google?.maps;
      if (api) resolve(api);
      else reject(new Error('google.maps no quedó disponible tras cargar el script'));
    };
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });
  return cached;
}
