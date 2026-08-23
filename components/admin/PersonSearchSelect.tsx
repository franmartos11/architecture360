'use client';

import { useState, useEffect } from 'react';

export interface PersonSearchResult {
  handle: string;
  display_name: string;
  avatar_image: string | null;
}

interface PersonSearchSelectProps {
  /** Persona ya elegida — null muestra el buscador, no-null muestra el chip seleccionado. */
  selected: PersonSearchResult | null;
  onSelect: (profile: PersonSearchResult) => void;
  onClear: () => void;
  placeholder?: string;
}

// Buscador de usuarios existentes por nombre o handle (reusa
// GET /api/profiles/search, mismo endpoint que NavSearch/SendPostModal) —
// reemplaza a tipear el handle a mano y arriesgarse a un "no existe ningún
// perfil con ese handle" recién al enviar el formulario.
export default function PersonSearchSelect({ selected, onSelect, onClear, placeholder }: PersonSearchSelectProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); return; }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetch(`/api/profiles/search?q=${encodeURIComponent(q)}`)
        .then(res => res.json())
        .then(data => { if (!cancelled) setResults(data.profiles ?? []); })
        .catch(() => { if (!cancelled) setResults([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const handleSelect = (r: PersonSearchResult) => {
    setQuery('');
    setResults([]);
    onSelect(r);
  };

  if (selected) {
    return (
      <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-300 bg-gray-50">
        <div className="w-6 h-6 rounded-full overflow-hidden shrink-0 bg-gray-200 flex items-center justify-center">
          {selected.avatar_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.avatar_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-gray-400 font-medium">{selected.display_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="text-sm text-gray-900 truncate flex-1">
          {selected.display_name} <span className="text-gray-400 font-mono text-xs">@{selected.handle}</span>
        </span>
        <button type="button" onClick={onClear} className="text-xs font-medium text-gray-400 hover:text-gray-700 shrink-0">
          Cambiar
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => setResults([]), 150)}
        placeholder={placeholder ?? 'Buscar por nombre o handle...'}
        aria-label="Buscar persona"
        className="w-full px-3.5 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 bg-white rounded-lg border border-gray-200 shadow-lg max-h-56 overflow-y-auto">
          {results.map(r => (
            <li key={r.handle}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(r)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-gray-200 flex items-center justify-center">
                  {r.avatar_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-gray-400 font-medium">{r.display_name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{r.display_name}</span>
                  <span className="block text-xs text-gray-400 truncate">@{r.handle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
