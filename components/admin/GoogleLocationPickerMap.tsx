'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, type GMap, type GMarker } from '@/lib/google-maps-loader';

// Córdoba, Argentina — centro inicial cuando no hay nada marcado ni
// coordenadas de proyecto (mismo que el mapa de leaflet).
const DEFAULT_CENTER = { lat: -31.4201, lng: -64.1888 };

interface Props {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Centro cuando no hay marcador (ej: las coordenadas del proyecto). */
  fallbackCenter?: { lat: number; lng: number } | null;
  /** Se incrementa para forzar un paneo animado (ej: elegir un resultado de búsqueda). */
  flyToken?: number;
}

// Misma interfaz que LocationPickerMap (leaflet) — el picker elige uno u
// otro según haya NEXT_PUBLIC_GOOGLE_MAPS_API_KEY. Marcador arrastrable,
// click en el mapa para (re)ubicar, paneo al cambiar flyToken.
export default function GoogleLocationPickerMap({ latitude, longitude, onChange, fallbackCenter, flyToken = 0 }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [error, setError] = useState(false);

  const hasPosition = latitude != null && longitude != null;

  // Init una sola vez.
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key || !divRef.current) return;
    let cancelled = false;

    loadGoogleMaps(key)
      .then(maps => {
        if (cancelled || !divRef.current) return;
        const center = hasPosition
          ? { lat: latitude, lng: longitude }
          : fallbackCenter ?? DEFAULT_CENTER;
        const map = new maps.Map(divRef.current, {
          center,
          zoom: hasPosition ? 15 : 11,
          disableDefaultUI: true,
          zoomControl: true,
          clickableIcons: false,
        });
        mapRef.current = map;

        map.addListener('click', e => {
          if (e.latLng) onChangeRef.current(e.latLng.lat(), e.latLng.lng());
        });

        if (hasPosition) {
          const marker = new maps.Marker({ position: { lat: latitude, lng: longitude }, map, draggable: true });
          marker.addListener('dragend', () => {
            const p = marker.getPosition();
            if (p) onChangeRef.current(p.lat(), p.lng());
          });
          markerRef.current = marker;
        }
      })
      .catch(() => { if (!cancelled) setError(true); });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza el marcador cuando cambian las props (search / clear / edición).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!hasPosition) {
      markerRef.current?.setMap(null);
      markerRef.current = null;
      return;
    }
    const pos = { lat: latitude, lng: longitude };
    if (markerRef.current) {
      markerRef.current.setPosition(pos);
    } else {
      const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
      loadGoogleMaps(key).then(maps => {
        if (!mapRef.current) return;
        const marker = new maps.Marker({ position: pos, map: mapRef.current, draggable: true });
        marker.addListener('dragend', () => {
          const p = marker.getPosition();
          if (p) onChangeRef.current(p.lat(), p.lng());
        });
        markerRef.current = marker;
      });
    }
  }, [latitude, longitude, hasPosition]);

  // Paneo al elegir un resultado de búsqueda.
  const firstFly = useRef(true);
  useEffect(() => {
    if (firstFly.current) { firstFly.current = false; return; }
    if (mapRef.current && hasPosition) {
      mapRef.current.panTo({ lat: latitude, lng: longitude });
      mapRef.current.setZoom(16);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 text-sm text-gray-500 px-4 text-center">
        No se pudo cargar Google Maps — revisá la API key y que esté habilitada la facturación.
      </div>
    );
  }

  return <div ref={divRef} className="w-full h-full" />;
}
