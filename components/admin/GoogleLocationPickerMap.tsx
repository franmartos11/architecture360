'use client';

import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, GOOGLE_MAPS_PUBLIC_KEY, type GMap, type GMarker } from '@/lib/google-maps-loader';
import MapsKeyMissing from './MapsKeyMissing';

// Córdoba, Argentina — centro inicial cuando no hay nada marcado ni
// coordenadas de proyecto.
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

// Mapa del picker de ubicación (solo Google). Marcador arrastrable, click
// en el mapa para (re)ubicar, paneo al cambiar flyToken.
export default function GoogleLocationPickerMap(props: Props) {
  if (!GOOGLE_MAPS_PUBLIC_KEY) return <MapsKeyMissing />;
  return <PickerMap {...props} />;
}

function PickerMap({ latitude, longitude, onChange, fallbackCenter, flyToken = 0 }: Props) {
  const divRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markerRef = useRef<GMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState(false);

  const hasPosition = latitude != null && longitude != null;

  // Mantiene la ref con el último onChange — se escribe en un efecto (no
  // durante el render) para no pisar refs mientras React está renderizando.
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Init una sola vez.
  useEffect(() => {
    if (!divRef.current) return;
    let cancelled = false;

    loadGoogleMaps()
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
      loadGoogleMaps().then(maps => {
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
        No se pudo cargar Google Maps — revisá la clave pública y que Maps JavaScript API esté habilitada.
      </div>
    );
  }

  return <div ref={divRef} className="w-full h-full" />;
}
