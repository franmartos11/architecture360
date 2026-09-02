'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { PoiCategory } from '@/types';
import { POI_CATEGORY_COLORS } from '@/lib/poiCategoryColors';

const DEFAULT_CENTER: [number, number] = [-31.4201, -64.1888];

function pinIcon(color: string, label: string, active: boolean) {
  const size = active ? 32 : 26;
  return L.divIcon({
    className: '',
    html:
      `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 3px;background:${color};` +
      `border:2px solid #fff;box-shadow:0 2px 6px rgba(16,24,40,.35);display:flex;align-items:center;` +
      `justify-content:center;transform:rotate(-45deg)${active ? ';outline:3px solid rgba(16,24,40,.18)' : ''}">` +
      `<span style="transform:rotate(45deg);font:600 11px system-ui,sans-serif;color:#fff">${label}</span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
  });
}

function projectIcon() {
  return L.divIcon({
    className: '',
    html:
      '<div style="width:34px;height:34px;border-radius:50%;background:#101828;border:3px solid #fff;' +
      'box-shadow:0 3px 10px rgba(16,24,40,.35);display:flex;align-items:center;justify-content:center;' +
      'font:600 9px system-ui,sans-serif;color:#fff;letter-spacing:.03em">AQUÍ</div>',
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

export interface OverviewPoi {
  id: string;
  name: string;
  category: PoiCategory;
  latitude: number | null;
  longitude: number | null;
}

interface LocationOverviewMapProps {
  center: { lat: number; lng: number } | null;
  pois: OverviewPoi[];
  selectedId: string | null;
  onSelectMarker: (id: string) => void;
  onMapClick: (lat: number, lng: number) => void;
  /** Se incrementa desde afuera ("Ver todos en el mapa") para forzar un fitBounds. */
  fitToken: number;
}

function ClickHandler({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Centra el mapa en todos los puntos ubicados + el centro del proyecto.
// Corre al montar y cada vez que `fitToken` cambia (botón "Ver todos").
function FitController({
  center,
  points,
  fitToken,
}: {
  center: { lat: number; lng: number } | null;
  points: [number, number][];
  fitToken: number;
}) {
  const map = useMap();
  useEffect(() => {
    const all = center ? points.concat([[center.lat, center.lng]]) : points;
    if (!all.length) return;
    const raf = requestAnimationFrame(() => {
      map.invalidateSize();
      if (all.length === 1) {
        map.setView(all[0], 15);
      } else {
        map.fitBounds(L.latLngBounds(all), { padding: [48, 48], maxZoom: 15 });
      }
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitToken]);
  return null;
}

export default function LocationOverviewMap({
  center,
  pois,
  selectedId,
  onSelectMarker,
  onMapClick,
  fitToken,
}: LocationOverviewMapProps) {
  const initialCenter: [number, number] = center ? [center.lat, center.lng] : DEFAULT_CENTER;
  const located = pois.filter((p): p is OverviewPoi & { latitude: number; longitude: number } =>
    p.latitude != null && p.longitude != null
  );

  return (
    <MapContainer
      center={initialCenter}
      zoom={center ? 13 : 11}
      className="w-full h-full"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ClickHandler onClick={onMapClick} />
      <FitController center={center} points={located.map(p => [p.latitude, p.longitude])} fitToken={fitToken} />
      {center && <Marker position={[center.lat, center.lng]} icon={projectIcon()} />}
      {located.map((p, i) => (
        <Marker
          key={p.id}
          position={[p.latitude, p.longitude]}
          zIndexOffset={selectedId === p.id ? 1000 : 0}
          icon={pinIcon(POI_CATEGORY_COLORS[p.category], String(i + 1), selectedId === p.id)}
          eventHandlers={{ click: () => onSelectMarker(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -26]}>{p.name}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
