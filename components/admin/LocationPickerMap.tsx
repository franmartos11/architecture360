'use client';

import { useCallback, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L, { type LeafletMouseEvent, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Los íconos default de Leaflet no resuelven bien las rutas bajo Next/webpack
// — se sirven copiados a /public/leaflet en vez de depender de un CDN.
const markerIcon = L.icon({
  iconUrl: '/leaflet/marker-icon.png',
  iconRetinaUrl: '/leaflet/marker-icon-2x.png',
  shadowUrl: '/leaflet/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Córdoba, Argentina — centro inicial cuando no hay nada marcado y el
// proyecto tampoco tiene coordenadas. Si el proyecto sí las tiene, se usa
// eso vía fallbackCenter.
const DEFAULT_CENTER: [number, number] = [-31.4201, -64.1888];

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Centro cuando no hay marcador (ej: las coordenadas del proyecto). */
  fallbackCenter?: { lat: number; lng: number } | null;
  /** Se incrementa para forzar un paneo animado (ej: al elegir un resultado de búsqueda). */
  flyToken?: number;
}

function ClickHandler({ onChange }: { onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Vuela hasta `position` cada vez que `flyToken` cambia — a diferencia de
// un click/drag en el propio mapa (que no necesita paneo porque el mapa ya
// está ahí), un resultado de búsqueda puede estar lejos de la vista
// actual. El guard de montaje evita un flyTo espurio al abrir el picker
// con una ubicación ya cargada.
function FlyOnSearch({ position, flyToken }: { position: [number, number] | null; flyToken: number }) {
  const map = useMap();
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (position) map.flyTo(position, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);
  return null;
}

export default function LocationPickerMap({ latitude, longitude, onChange, fallbackCenter, flyToken = 0 }: LocationPickerMapProps) {
  const hasPosition = latitude != null && longitude != null;
  const center: [number, number] = hasPosition
    ? [latitude, longitude]
    : fallbackCenter ? [fallbackCenter.lat, fallbackCenter.lng] : DEFAULT_CENTER;
  const markerRef = useRef<LeafletMarker>(null);

  const handleDragEnd = useCallback(() => {
    const marker = markerRef.current;
    if (!marker) return;
    const { lat, lng } = marker.getLatLng();
    onChange(lat, lng);
  }, [onChange]);

  return (
    <MapContainer center={center} zoom={hasPosition ? 15 : 11} scrollWheelZoom={false} className="w-full h-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onChange={onChange} />
      <FlyOnSearch position={hasPosition ? [latitude, longitude] : null} flyToken={flyToken} />
      {hasPosition && (
        <Marker
          position={[latitude, longitude]}
          icon={markerIcon}
          draggable
          ref={markerRef}
          eventHandlers={{ dragend: handleDragEnd }}
        />
      )}
    </MapContainer>
  );
}
