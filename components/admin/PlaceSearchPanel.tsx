'use client';

import { useEffect, useRef, useState, startTransition } from 'react';
import { POI_CATEGORY_COLORS, POI_CATEGORY_ADMIN_LABELS } from '@/lib/poiCategoryColors';

import { distanceMeters, formatDistance, isAlreadyAdded, type PlaceResult } from '@/lib/google-places';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 400;

interface PlaceSearchPanelProps {
  /** Coordenadas del proyecto: sesgan la búsqueda y dan la distancia. */
  center: { lat: number; lng: number } | null;
  /** POIs ya cargados, para marcar "Ya agregado". */
  pois: { name: string; latitude: number | null; longitude: number | null }[];
  onAdd: (place: PlaceResult) => Promise<void>;
}

// Buscador de lugares en Google para Ubicación/entorno: escribís, aparece
// una lista cerca del proyecto y cada resultado se agrega con un click
// como punto de interés ya ubicado.
export default function PlaceSearchPanel({ center, pois, onAdd }: PlaceSearchPanelProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const addingRef = useRef(new Set<string>());
  const requestRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < MIN_CHARS) {
      startTransition(() => { setResults(null); setError(null); setSearching(false); });
      return;
    }
    const timer = setTimeout(() => {
      const id = ++requestRef.current;
      setSearching(true);
      const params = new URLSearchParams({ q });
      if (center) { params.set('lat', String(center.lat)); params.set('lng', String(center.lng)); }
      fetch(`/api/admin/places-search?${params}`)
        .then(async res => {
          const data = await res.json().catch(() => ({}));
          if (id !== requestRef.current) return;
          setResults(data.results ?? []);
          setError(res.ok ? null : (data.error ?? 'No se pudo buscar en Google.'));
        })
        .catch(() => {
          if (id !== requestRef.current) return;
          setResults([]);
          setError('No se pudo buscar en Google.');
        })
        .finally(() => { if (id === requestRef.current) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, center]);

  const handleAdd = async (place: PlaceResult) => {
    // Ref además del state: dos clicks en el mismo tick ven el state viejo.
    if (addingRef.current.has(place.placeId)) return;
    addingRef.current.add(place.placeId);
    setAdding(new Set(addingRef.current));
    try {
      await onAdd(place);
    } finally {
      addingRef.current.delete(place.placeId);
      setAdding(new Set(addingRef.current));
    }
  };

  const q = query.trim();

  return (
    <div className="flex flex-col gap-2 min-h-0">
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder='Buscar en Google: "colegio", "Farmacia Del Pueblo"…'
        aria-label="Buscar lugar en Google"
        className="w-full h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
      />

      {searching && <p className="text-[11px] text-gray-400">Buscando…</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
      {!searching && !error && results?.length === 0 && (
        <p className="text-[11px] text-gray-400">Sin resultados en Google para «{q}».</p>
      )}

      {!!results?.length && (
        <ul className="max-h-72 overflow-y-auto -mx-1 divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {results.map(r => {
            const added = isAlreadyAdded(r, pois);
            const busy = adding.has(r.placeId);
            const color = POI_CATEGORY_COLORS[r.category];
            return (
              <li key={r.placeId} className="flex items-start gap-2 px-2.5 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{r.address}</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded" style={{ color, background: `${color}1f` }}>
                      {POI_CATEGORY_ADMIN_LABELS[r.category]}
                    </span>
                    {center && (
                      <span data-distance className="text-[10px] text-gray-400">
                        {formatDistance(distanceMeters(center, r))}
                      </span>
                    )}
                  </div>
                </div>
                {added ? (
                  <span className="flex-none h-7 px-2 flex items-center rounded-md text-[11px] font-medium bg-gray-100 text-gray-500">
                    Ya agregado
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleAdd(r)}
                    disabled={busy}
                    className="flex-none h-7 px-2.5 flex items-center rounded-md text-[11px] font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-60 disabled:cursor-wait transition-colors"
                  >
                    {busy ? 'Agregando…' : '+ Agregar'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
