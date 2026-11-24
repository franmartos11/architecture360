'use client';

import { useEffect, useRef, useState } from 'react';
import type { PoiCategory } from '@/types';
import { POI_CATEGORY_COLORS } from '@/lib/poiCategoryColors';
import { loadGoogleMaps, GOOGLE_MAPS_PUBLIC_KEY, type GMap, type GMarker, type GoogleMapsApi, type GSymbol } from '@/lib/google-maps-loader';
import MapsKeyMissing from './MapsKeyMissing';

// Córdoba, Argentina — centro inicial sin coordenadas de proyecto.
const DEFAULT_CENTER = { lat: -31.4201, lng: -64.1888 };
const MAX_FIT_ZOOM = 15;
// Gota de 24×32 con la punta abajo al centro.
const PIN_PATH = 'M12 0C5.4 0 0 5.4 0 12c0 9 12 20 12 20s12-11 12-20C24 5.4 18.6 0 12 0z';

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
  /** Pin seleccionado arrastrado a otra posición. Si resuelve `false`
   *  (no se pudo guardar), el pin vuelve a la última posición conocida. */
  onMoveMarker?: (id: string, lat: number, lng: number) => Promise<boolean> | void;
}

function pinIcon(maps: GoogleMapsApi, color: string, active: boolean): GSymbol {
  return {
    path: PIN_PATH,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: active ? 1.25 : 1,
    anchor: new maps.Point(12, 32),
    labelOrigin: new maps.Point(12, 12),
  };
}

type Located = OverviewPoi & { latitude: number; longitude: number };

export default function LocationOverviewMap(props: LocationOverviewMapProps) {
  if (!GOOGLE_MAPS_PUBLIC_KEY) return <MapsKeyMissing />;
  return <GoogleOverview {...props} />;
}

function GoogleOverview({ center, pois, selectedId, onSelectMarker, onMapClick, fitToken, onMoveMarker }: LocationOverviewMapProps) {
  const divRef = useRef<HTMLDivElement>(null);
  const [api, setApi] = useState<{ maps: GoogleMapsApi; map: GMap } | null>(null);
  const [error, setError] = useState(false);
  const markersRef = useRef(new Map<string, GMarker>());
  // Última posición que vino por props (la guardada), para revertir un drag fallido.
  const positionsRef = useRef(new Map<string, { lat: number; lng: number }>());
  const projectMarkerRef = useRef<GMarker | null>(null);
  const handlersRef = useRef({ onSelectMarker, onMapClick, onMoveMarker });

  useEffect(() => {
    handlersRef.current = { onSelectMarker, onMapClick, onMoveMarker };
  });

  // Init una sola vez.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !divRef.current) return;
        const map = new maps.Map(divRef.current, {
          center: center ?? DEFAULT_CENTER,
          zoom: center ? 13 : 11,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
          gestureHandling: 'greedy',
        });
        map.addListener('click', e => {
          if (e.latLng) handlersRef.current.onMapClick(e.latLng.lat(), e.latLng.lng());
        });
        setApi({ maps, map });
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcador "AQUÍ" del proyecto.
  useEffect(() => {
    if (!api) return;
    const { maps, map } = api;
    projectMarkerRef.current?.setMap(null);
    projectMarkerRef.current = center
      ? new maps.Marker({
          position: center,
          map,
          zIndex: 2000,
          title: 'Proyecto',
          icon: {
            path: maps.SymbolPath.CIRCLE,
            scale: 17,
            fillColor: '#101828',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          label: { text: 'AQUÍ', color: '#ffffff', fontSize: '9px', fontWeight: '600' },
        })
      : null;
  }, [api, center]);

  // Pines de POIs, sincronizados por id (sin reconstruir el mapa).
  useEffect(() => {
    if (!api) return;
    const { maps, map } = api;
    const markers = markersRef.current;
    const located = pois.filter((p): p is Located => p.latitude != null && p.longitude != null);
    const keep = new Set(located.map(p => p.id));

    for (const [id, marker] of markers) {
      if (!keep.has(id)) { marker.setMap(null); markers.delete(id); }
    }

    located.forEach((p, i) => {
      const active = p.id === selectedId;
      const icon = pinIcon(maps, POI_CATEGORY_COLORS[p.category], active);
      const label = { text: String(i + 1), color: '#ffffff', fontSize: '11px', fontWeight: '600' };
      const position = { lat: p.latitude, lng: p.longitude };
      positionsRef.current.set(p.id, position);
      let marker = markers.get(p.id);
      if (!marker) {
        marker = new maps.Marker({ position, map, icon, label, title: p.name });
        const id = p.id;
        const m = marker;
        marker.addListener('click', () => handlersRef.current.onSelectMarker(id));
        marker.addListener('dragend', async () => {
          const pos = m.getPosition();
          if (!pos) return;
          const ok = await handlersRef.current.onMoveMarker?.(id, pos.lat(), pos.lng());
          const saved = positionsRef.current.get(id);
          if (ok === false && saved) m.setPosition(saved);
        });
        markers.set(p.id, marker);
      } else {
        marker.setPosition(position);
        marker.setIcon(icon);
        marker.setLabel(label);
        marker.setTitle(p.name);
      }
      marker.setDraggable(active && !!handlersRef.current.onMoveMarker);
      marker.setZIndex(active ? 1000 : i);
    });
  }, [api, pois, selectedId]);

  // Encuadre: al montar y con cada "Ver todos en el mapa".
  useEffect(() => {
    if (!api) return;
    const { maps, map } = api;
    const points = pois
      .filter((p): p is Located => p.latitude != null && p.longitude != null)
      .map(p => ({ lat: p.latitude, lng: p.longitude }));
    if (center) points.push(center);
    if (!points.length) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(MAX_FIT_ZOOM);
      return;
    }
    const bounds = new maps.LatLngBounds();
    points.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, 48);
    // Si el encuadre no mueve la cámara, 'idle' puede no llegar: sin quitarlo,
    // el tope de zoom quedaría colgado y frenaría el próximo zoom manual.
    const capZoom = maps.event.addListenerOnce(map, 'idle', () => {
      if ((map.getZoom() ?? 0) > MAX_FIT_ZOOM) map.setZoom(MAX_FIT_ZOOM);
    });
    return () => capZoom.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, fitToken]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-sm text-gray-500 px-4 text-center">
        No se pudo cargar Google Maps — revisá la clave pública y que Maps JavaScript API esté habilitada.
      </div>
    );
  }

  return <div ref={divRef} className="absolute inset-0" />;
}
