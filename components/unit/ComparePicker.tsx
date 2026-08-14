'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Unit } from '@/types';
import { similarityScore } from '@/lib/units';

interface ComparePickerProps {
  baseUnit: Unit;
  candidates: Unit[];
  onSelect: (unit: Unit) => void;
  onClose: () => void;
}

export default function ComparePicker({ baseUnit, candidates, onSelect, onClose }: ComparePickerProps) {
  const [search, setSearch] = useState('');
  const [bedroomFilter, setBedroomFilter] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchInputRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const bedroomOptions = useMemo(
    () => Array.from(new Set(candidates.map(u => u.bedrooms))).sort((a, b) => a - b),
    [candidates]
  );

  const ranked = useMemo(() => {
    const q = search.trim().toLowerCase();
    return candidates
      .filter(u => !q || u.name.toLowerCase().includes(q) || u.type.toLowerCase().includes(q) || String(u.floor).includes(q))
      .filter(u => bedroomFilter === null || u.bedrooms === bedroomFilter)
      .map(u => ({ unit: u, score: similarityScore(baseUnit, u) }))
      .sort((a, b) => b.score - a.score);
  }, [candidates, search, bedroomFilter, baseUnit]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir unidad para comparar"
      className="w-full max-w-sm h-full bg-white shadow-xl flex flex-col"
      onClick={e => e.stopPropagation()}
    >
      <div className="px-5 py-4 border-b border-gray-200 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Elegir unidad</h3>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">✕</button>
        </div>
        <input
          ref={searchInputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, tipología o piso..."
          className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
        />
        {bedroomOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {bedroomOptions.map(n => (
              <button
                key={n}
                onClick={() => setBedroomFilter(bedroomFilter === n ? null : n)}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                  bedroomFilter === n ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {n} amb.
              </button>
            ))}
            {bedroomFilter !== null && (
              <button onClick={() => setBedroomFilter(null)} className="text-xs text-gray-400 hover:text-gray-700 underline">
                Limpiar
              </button>
            )}
          </div>
        )}
        {search.trim() === '' && bedroomFilter === null && ranked.length > 0 && (
          <p className="text-[11px] text-gray-400">Ordenadas por similitud con {baseUnit.name}</p>
        )}
      </div>

      <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
        {ranked.map(({ unit: u, score }) => {
          const thumb = u.technicalPlanUrl || u.plan3dUrl || u.interiorImageUrl;
          return (
            <button
              key={u.id}
              onClick={() => onSelect(u)}
              className="w-full flex items-center gap-3 text-left px-5 py-3 hover:bg-gray-50 transition-colors"
            >
              <div className="w-12 h-12 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h12A2.25 2.25 0 0120.25 6v12a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18V6z" />
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm truncate">{u.name}</p>
                <p className="text-xs text-gray-500 truncate">
                  Piso {u.floor} · {u.bedrooms} amb. · {u.bathrooms} baño{u.bathrooms === 1 ? '' : 's'} · {u.totalArea} m²
                </p>
              </div>
              <span
                className={`text-xs font-semibold rounded-full px-2.5 py-1 shrink-0 ${
                  score >= 90 ? 'bg-green-50 text-green-700' : score >= 70 ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {score}%
              </span>
            </button>
          );
        })}
        {ranked.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">
            {candidates.length === 0
              ? 'No hay otras unidades con recorrido 360° cargado todavía.'
              : 'Ninguna unidad coincide con la búsqueda.'}
          </p>
        )}
      </div>
    </div>
  );
}
