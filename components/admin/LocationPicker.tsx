'use client';

import { useState, useEffect, useRef, startTransition } from 'react';
import dynamic from 'next/dynamic';

import type { PlaceResult } from '@/lib/google-places';

// Mapa y buscador son de Google: el mapa con la clave pública, el buscador
// vía /api/admin/places-search (Places API New, clave del servidor).
const LocationPickerMap = dynamic(() => import('./GoogleLocationPickerMap'), {
  ssr: false,
  loading: () => <div className="h-72 rounded-xl bg-gray-100 animate-pulse" />,
});

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
// queda en null como antes de tener este picker.
export default function LocationPicker({ latitude, longitude, onChange, label = 'Ubicación', fallbackCenter }: LocationPickerProps) {
  const hasPosition = latitude != null && longitude != null;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [flyToken, setFlyToken] = useState(0);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Texto que puso selectResult en el input: no es una búsqueda nueva (cada
  // búsqueda se factura en Places y reabriría la lista recién cerrada).
  const selectedLabelRef = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (selectedLabelRef.current === query) return;
    selectedLabelRef.current = null;
    if (q.length < 3) { startTransition(() => { setResults([]); setSearchError(null); }); return; }
    startTransition(() => { setSearching(true); });
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q });
      // Sesgo: la ubicación ya marcada; si no hay, el centro de respaldo.
      const bias = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : fallbackCenter;
      if (bias) { params.set('lat', String(bias.lat)); params.set('lng', String(bias.lng)); }
      fetch(`/api/admin/places-search?${params}`)
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          setSearchError(res.ok ? null : (data.error ?? 'No se pudo buscar en Google.'));
          setResults((data.results ?? []).map((r: PlaceResult) => ({
            label: r.address && r.address !== r.name ? `${r.name} — ${r.address}` : r.name,
            lat: r.lat,
            lng: r.lng,
          })));
        })
        .catch(() => { setResults([]); setSearchError('No se pudo buscar en Google.'); })
        .finally(() => setSearching(false));
    }, 400);
    return () => clearTimeout(timer);
    // La ubicación/fallbackCenter solo sesgan la búsqueda: no re-buscar si cambian.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const selectResult = (r: SearchResult) => {
    onChange(r.lat, r.lng);
    setFlyToken(t => t + 1);
    selectedLabelRef.current = r.label;
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
        {!searching && searchError && <p className="text-xs text-red-600 mt-1">{searchError}</p>}
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
