'use client';

import { useState } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import type { Unit } from '@/types';
import { formatPrice, unitIsDwelling } from '@/lib/units';
import ComparePaneContent, { type CompareContentType } from './ComparePaneContent';

// Comparador en mobile: barra propia con volver y agregar, vistas en
// pestañas, las dos unidades en tarjetas (apiladas o lado a lado) y los
// datos en un panel plegable abajo. En escritorio sigue el de paneles
// divididos con slider (CompareView).

const A_COLOR = '#111827';
const B_COLOR = '#2E7D4F';

interface Row { label: string; a: string; b: string }

function areaLabel(n: number | undefined) {
  return n ? `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })} m²` : '—';
}

function compareRows(a: Unit, b: Unit, showPrice: boolean): Row[] {
  const ext = (u: Unit) => (u.balconyArea ?? 0) + (u.externalArea ?? 0);
  const floor = (u: Unit) => (u.floor === 0 ? 'PB' : String(u.floor));
  const dwelling = unitIsDwelling(a) && unitIsDwelling(b);
  return [
    { label: 'Sup. total', a: areaLabel(a.totalArea), b: areaLabel(b.totalArea) },
    { label: 'Interior', a: areaLabel(a.innerArea), b: areaLabel(b.innerArea) },
    { label: 'Exterior', a: areaLabel(ext(a)), b: areaLabel(ext(b)) },
    ...(dwelling
      ? [
          { label: 'Dormitorios', a: a.bedrooms === 0 ? 'Mono.' : String(a.bedrooms), b: b.bedrooms === 0 ? 'Mono.' : String(b.bedrooms) },
          { label: 'Baños', a: String(a.bathrooms), b: String(b.bathrooms) },
        ]
      : []),
    { label: 'Piso', a: floor(a), b: floor(b) },
    { label: 'Orientación', a: a.orientation || '—', b: b.orientation || '—' },
    ...(showPrice
      ? [{
          label: 'Precio',
          a: a.price ? formatPrice(a.price, a.currency) : '—',
          b: b.price ? formatPrice(b.price, b.currency) : '—',
        }]
      : []),
  ];
}

function Badge({ letter, size = 28 }: { letter: 'A' | 'B'; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-lg flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, fontSize: size > 24 ? 13 : 11, background: letter === 'A' ? A_COLOR : B_COLOR }}
    >
      {letter}
    </span>
  );
}

export default function CompareMobile({
  unit, compareUnit, contentTypes, contentType, onContentTypeChange,
  onClose, onPick, onClearCompare, showPrice, onContact,
}: {
  unit: Unit;
  compareUnit: Unit | null;
  contentTypes: { id: CompareContentType; label: string }[];
  contentType: CompareContentType;
  onContentTypeChange: (t: CompareContentType) => void;
  onClose: () => void;
  onPick: () => void;
  onClearCompare: () => void;
  showPrice: boolean;
  /** Ausente si el proyecto no tiene formulario de contacto. */
  onContact?: (u: Unit) => void;
}) {
  const [layout, setLayout] = useState<'stack' | 'side'>('stack');
  // Cerrados al entrar: primero se ven las unidades; los datos, a un toque.
  const [dataOpen, setDataOpen] = useState(false);
  const rows = compareUnit ? compareRows(unit, compareUnit, showPrice) : [];

  return (
    <div className="absolute inset-0 flex flex-col bg-[#F6F6F4] text-gray-900">
      {/* Barra */}
      <header className="shrink-0 bg-[#1B1D1A]" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="h-14 flex items-center gap-1 px-2">
          <button type="button" onClick={onClose} aria-label="Salir del comparador" className="w-11 h-11 rounded-xl flex items-center justify-center text-white">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="text-base font-bold text-white leading-tight whitespace-nowrap truncate">Comparar unidades</span>
            <span className="text-xs text-[#C2C6BF] truncate">
              {compareUnit ? `${unit.name} vs ${compareUnit.name}` : 'Elegí otra unidad'}
            </span>
          </div>
          <button
            type="button"
            onClick={onPick}
            className="shrink-0 h-10 px-3 rounded-xl bg-[var(--theme-accent)] text-[var(--theme-text-on-accent)] text-[13px] font-bold flex items-center gap-1.5"
          >
            {!compareUnit && (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            )}
            {compareUnit ? 'Cambiar' : 'Agregar'}
          </button>
        </div>
      </header>

      {/* Vistas + disposición */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-white border-b border-[#ECEEF0]">
        <div className="flex-1 min-w-0 flex gap-0.5 p-0.5 rounded-[22px] bg-[#F1F3F4] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Qué comparar">
          {contentTypes.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => onContentTypeChange(t.id)}
              aria-pressed={contentType === t.id}
              className={`flex-auto h-10 px-3 rounded-full text-[13px] font-semibold whitespace-nowrap transition-colors ${
                contentType === t.id ? 'bg-gray-900 text-white' : 'text-[#3C4043]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLayout(l => (l === 'stack' ? 'side' : 'stack'))}
          aria-label={layout === 'stack' ? 'Ver lado a lado' : 'Ver apiladas'}
          className="w-11 h-11 shrink-0 rounded-xl border border-[#DADDE1] bg-white flex items-center justify-center text-gray-900"
        >
          {layout === 'stack' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><rect x="3" y="4" width="8" height="16" rx="2" /><rect x="13" y="4" width="8" height="16" rx="2" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><rect x="4" y="3" width="16" height="8" rx="2" /><rect x="4" y="13" width="16" height="8" rx="2" /></svg>
          )}
        </button>
      </div>

      {/* Las dos unidades */}
      <div className="shrink-0 grid grid-cols-2 gap-2 px-4 py-2.5 bg-white border-b border-[#ECEEF0]">
        <div className="min-w-0 flex items-center gap-2 h-12 pl-2 pr-3 rounded-xl border border-[#DADDE1]">
          <Badge letter="A" />
          <span className="min-w-0 flex flex-col leading-tight">
            <span className="text-sm font-bold">{unit.name}</span>
            {unit.modelName && <span className="text-[11px] text-[#5F6368] truncate">{unit.modelName}</span>}
          </span>
        </div>
        {compareUnit ? (
          <div className="min-w-0 flex items-center gap-2 h-12 pl-2 rounded-xl border border-[#DADDE1]">
            <Badge letter="B" />
            <span className="flex-1 min-w-0 flex flex-col leading-tight">
              <span className="text-sm font-bold">{compareUnit.name}</span>
              {compareUnit.modelName && <span className="text-[11px] text-[#5F6368] truncate">{compareUnit.modelName}</span>}
            </span>
            <button type="button" onClick={onClearCompare} aria-label={`Quitar unidad ${compareUnit.name}`} className="w-11 h-11 shrink-0 flex items-center justify-center text-[#5F6368]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </div>
        ) : (
          <button type="button" onClick={onPick} className="min-w-0 flex items-center gap-2 h-12 px-3 rounded-xl border border-dashed border-[#B9BEC4] text-[13px] font-semibold text-[#3C4043]">
            <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-lg border border-dashed border-[#B9BEC4] flex items-center justify-center">B</span>
            Elegir unidad
          </button>
        )}
      </div>

      {/* Vistas */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className={`flex gap-3 px-4 pt-3 pb-4 ${layout === 'stack' ? 'flex-col' : 'flex-row gap-2'}`}>
          <MediaCard unit={unit} letter="A" contentType={contentType} />
          {compareUnit ? (
            <MediaCard unit={compareUnit} letter="B" contentType={contentType} />
          ) : (
            <button
              type="button"
              onClick={onPick}
              className="flex-1 min-w-0 aspect-[561/419] rounded-2xl border-2 border-dashed border-[#C9CDD2] bg-white flex flex-col items-center justify-center gap-2 text-sm font-semibold text-[#3C4043]"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Elegir unidad a comparar
            </button>
          )}
        </div>
      </div>

      {/* Datos comparados */}
      {compareUnit && (
        <div className="shrink-0 relative z-10 rounded-t-[20px] bg-white shadow-[0_-6px_20px_rgba(0,0,0,0.10)]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <button
            type="button"
            onClick={() => setDataOpen(o => !o)}
            aria-expanded={dataOpen}
            className="w-full h-[52px] flex items-center gap-2 px-4 text-gray-900"
          >
            <span className="flex-1 text-left text-[15px] font-bold">Datos comparados</span>
            <span className="text-[13px] font-semibold text-[#5F6368]">{dataOpen ? 'Ocultar' : 'Mostrar'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform ${dataOpen ? '' : 'rotate-180'}`}><path d="M6 9l6 6 6-6" /></svg>
          </button>
          <AnimatePresence initial={false}>
            {dataOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <div className="max-h-[34dvh] overflow-y-auto pb-3">
                  <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center min-h-8 px-4 border-b border-[#DADDE1]">
                    <span />
                    <span className="flex justify-end"><Badge letter="A" size={22} /></span>
                    <span className="flex justify-end"><Badge letter="B" size={22} /></span>
                  </div>
                  <dl className="m-0">
                    {rows.map(r => (
                      <div key={r.label} className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center min-h-11 px-4 border-b border-[#ECEEF0] text-sm">
                        <dt className="flex items-center gap-1.5 text-[13px] text-[#5F6368]">
                          {r.label}
                          {r.a === r.b && r.a !== '—' && (
                            <span className="text-[10px] font-bold tracking-[0.06em] text-[#5F6368] bg-[#F1F3F4] rounded-md px-1.5 py-0.5">IGUAL</span>
                          )}
                        </dt>
                        <dd className="m-0 text-right font-bold tabular-nums">{r.a}</dd>
                        <dd className="m-0 text-right font-bold tabular-nums">{r.b}</dd>
                      </div>
                    ))}
                  </dl>
                  {onContact && (
                    <div className="flex gap-2 px-4 pt-3 pb-1">
                      <button type="button" onClick={() => onContact(unit)} className="flex-1 h-12 rounded-[14px] border border-gray-900 bg-white text-sm font-bold text-gray-900">
                        Consultar {unit.name}
                      </button>
                      <button type="button" onClick={() => onContact(compareUnit)} className="flex-1 h-12 rounded-[14px] bg-gray-900 text-sm font-bold text-white">
                        Consultar {compareUnit.name}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function MediaCard({ unit, letter, contentType }: { unit: Unit; letter: 'A' | 'B'; contentType: CompareContentType }) {
  return (
    <div className="relative flex-1 min-w-0 aspect-[561/419] rounded-2xl overflow-hidden bg-white">
      <ComparePaneContent unit={unit} contentType={contentType} bare />
      <span className="absolute left-2.5 bottom-2.5 z-10 shadow-[0_2px_6px_rgba(0,0,0,0.3)] rounded-lg pointer-events-none">
        <Badge letter={letter} />
      </span>
    </div>
  );
}
