'use client';

import { useState, useEffect, startTransition } from 'react';

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
    if (!q) { startTransition(() => { setResults([]); }); return; }
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
      <div className="flex items-center gap-2.5 min-h-[44px] px-3 rounded-[10px] border border-brand-700 bg-brand-50">
        <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 bg-brand-700 flex items-center justify-center">
          {selected.avatar_image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={selected.avatar_image} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[11px] text-white font-semibold">{selected.display_name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <span className="text-sm text-gray-900 truncate flex-1">
          {selected.display_name} <span className="text-gray-400 font-mono text-xs">@{selected.handle}</span>
        </span>
        <button type="button" onClick={onClear} className="min-h-[36px] px-1 text-xs font-medium text-gray-600 hover:text-gray-900 shrink-0">
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
        className="w-full min-h-[44px] px-3.5 rounded-[10px] border border-gray-300 bg-white text-sm outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30 placeholder:text-gray-400"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1.5 bg-white rounded-xl border border-gray-200 shadow-[0_16px_34px_-14px_rgba(23,25,26,.3)] max-h-64 overflow-y-auto p-1">
          {results.map(r => (
            <li key={r.handle}>
              <button
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => handleSelect(r)}
                className="w-full flex items-center gap-3 min-h-[52px] px-3 rounded-lg text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 bg-brand-700 flex items-center justify-center">
                  {r.avatar_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.avatar_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs text-white font-semibold">{r.display_name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate">{r.display_name}</span>
                  <span className="block text-xs text-gray-500 truncate">@{r.handle}</span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-brand-700">Agregar</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
