'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Si hay API key de Google, el mapa interactivo es Google Maps; si no, el
// de OpenStreetMap/leaflet de siempre. El buscador de direcciones queda
// igual en ambos casos (Nominatim, sin billing).
const HAS_GMAPS = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const loading = () => <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />;
const LocationPickerMap = HAS_GMAPS
  ? dynamic(() => import('./GoogleLocationPickerMap'), { ssr: false, loading })
  : dynamic(() => import('./LocationPickerMap'), { ssr: false, loading });

interface SearchResult {
  label: string;
  lat: number;
  lng: number;
}

interface LocationPickerProps {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  label?: string;
  /** Centro del mapa cuando todavía no hay nada marcado — ej. las
   *  coordenadas del proyecto, para que un POI nuevo abra cerca. */
  fallbackCenter?: { lat: number; lng: number } | null;
}

// Click en el mapa (o elegir un resultado del buscador) para marcar la
// ubicación — arrastrable después. Siempre opcional: sin marcar nada,
// queda en null como antes de tener este picker. El buscador pega contra
// /api/admin/geocode (proxy a Nominatim, gratis, sin API key) en vez de
// Google Places para no depender de billing.
export default function LocationPicker({ latitude, longitude, onChange, label = 'Ubicación', fallbackCenter }: LocationPickerProps) {
  const hasPosition = latitude != null && longitude != null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flyToken, setFlyToken] = useState(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      fetch(`/api/admin/geocode?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => setResults(data.results ?? []))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  const selectResult = (r: SearchResult) => {
    onChange(r.lat, r.lng);
    setFlyToken(t => t + 1);
    setQuery(r.label);
    setResults([]);
  };

  const clearLocation = () => {
    onChange(null, null);
    setQuery('');
    setResults([]);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">{label} (opcional)</label>
        {hasPosition && (
          <button type="button" onClick={clearLocation} className="text-xs font-medium text-red-500 hover:text-red-700">
            Quitar ubicación
          </button>
        )}
      </div>

      <div className="relative mb-2">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setResults([]), 150)}
          placeholder="Buscar una dirección o lugar..."
          aria-label="Buscar dirección"
          className="w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
        />
        {results.length > 0 && (
          <ul className="absolute z-[1000] left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-56 overflow-y-auto">
            {results.map((r, i) => (
              <li key={i}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => selectResult(r)}
                  className="w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {r.label}
                </button>
              </li>
            ))}
          </ul>
        )}
        {searching && <p className="text-xs text-gray-400 mt-1">Buscando...</p>}
      </div>

      <div className="h-72 rounded-xl overflow-hidden border border-gray-200">
        <LocationPickerMap latitude={latitude} longitude={longitude} onChange={onChange} fallbackCenter={fallbackCenter} flyToken={flyToken} />
      </div>
      <div className="flex items-center justify-between gap-3 mt-1.5">
        <p className="text-xs text-gray-400">
          {hasPosition
            ? `${latitude.toFixed(5)}, ${longitude.toFixed(5)} — arrastrá el pin o hacé click en otro punto para moverlo.`
            : 'Buscá una dirección o hacé click en el mapa para marcar la ubicación.'}
        </p>
        {hasPosition && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0 whitespace-nowrap"
          >
            Ver en Google Maps ↗
          </a>
        )}
      </div>
    </div>
  );
}
