'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import type { Unit, UnitViewTab } from '@/types';
import { useShareLink } from '@/hooks/useShareLink';
import ComparePicker from './ComparePicker';
import CompareMetricsBar from './CompareMetricsBar';
import ComparePaneContent, { type CompareContentType } from './ComparePaneContent';

const CONTENT_TYPES: { id: CompareContentType; label: string }[] = [
  { id: 'planta3d', label: 'Planta 3D' },
  { id: 'tour360', label: '360°' },
  { id: 'plano', label: 'Planos' },
  { id: 'galeria', label: 'Galería' },
];
const SUPPORTED_TYPES = CONTENT_TYPES.map(t => t.id);

interface CompareViewProps {
  unit: Unit;
  allUnits: Unit[];
  initialContentType?: UnitViewTab;
  initialCompareUnitId?: string | null;
  onClose: () => void;
}

export default function CompareView({ unit, allUnits, initialContentType, initialCompareUnitId, onClose }: CompareViewProps) {
  const [compareUnitId, setCompareUnitId] = useState<string | null>(initialCompareUnitId ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contentType, setContentType] = useState<CompareContentType>(() =>
    SUPPORTED_TYPES.includes(initialContentType as CompareContentType) ? (initialContentType as CompareContentType) : 'planta3d'
  );
  const [metricsVisible, setMetricsVisible] = useState(true);
  const shareLink = useShareLink();
  const [splitPercent, setSplitPercent] = useState(50);
  const [isDesktop, setIsDesktop] = useState(false);
  const panesRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Cualquier otra unidad es candidata — no todos los aspectos comparables
  // (360°, galería, planos) dependen de tener recorrido cargado, así que
  // no filtramos por eso acá; cada aspecto muestra su propio estado vacío.
  const candidates = useMemo(() => allUnits.filter(u => u.id !== unit.id), [allUnits, unit.id]);
  const compareUnit = candidates.find(u => u.id === compareUnitId) ?? null;

  // El slider central arrastrable solo tiene sentido en el layout lado a
  // lado (desktop) — en mobile los paneles quedan apilados verticalmente.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Deep-link: reflejar la unidad B elegida en la URL (?compare=unitId)
  // para poder compartir el link directo a esta comparación puntual.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (compareUnitId) url.searchParams.set('compare', compareUnitId);
    else url.searchParams.delete('compare');
    window.history.replaceState(null, '', url);
  }, [compareUnitId]);

  useEffect(() => {
    return () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('compare');
      window.history.replaceState(null, '', url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr al desmontar (salir del comparador), no en cada cambio de unidad
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !panesRef.current) return;
    const rect = panesRef.current.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    setSplitPercent(Math.min(85, Math.max(15, pct)));
  };
  const handlePointerUp = () => {
    draggingRef.current = false;
  };

  const showSlider = isDesktop && !!compareUnit;
  const leftWidth = showSlider ? `${splitPercent}%` : undefined;
  const rightWidth = showSlider ? `${100 - splitPercent}%` : undefined;

  return (
    <motion.div
      key="compare"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[100] flex flex-col bg-white"
    >
      <div className="absolute top-5 right-5 z-30 flex items-center gap-2">
        {compareUnit && (
          <button
            onClick={() => setPickerOpen(true)}
            aria-label="Cambiar unidad"
            className="flex items-center gap-2 bg-white hover:bg-gray-50 border border-gray-200 text-gray-800 rounded-full pl-3 lg:pl-4 pr-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-all shadow-lg"
          >
            <span className="hidden lg:inline">Cambiar Unidad</span>
            <svg className="w-3.5 h-3.5 opacity-80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          </button>
        )}
        {compareUnit && (
          <button
            onClick={() => shareLink(
              window.location.href,
              `${unit.name} vs ${compareUnit.name}`,
              `Mirá esta comparación: ${unit.name} vs ${compareUnit.name}`
            )}
            aria-label="Compartir comparación"
            className="w-10 h-10 rounded-full bg-white hover:bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-lg shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
            </svg>
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Salir del comparador"
          className="w-10 h-10 rounded-full bg-white hover:bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-700 transition-all shadow-lg shrink-0"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Segmented Control de Vistas — mismo nivel (top-5) que los badges de
          nombre de unidad; no chocan porque los badges se centran dentro de
          cada panel (25%/75% de ancho) y esto se centra en toda la pantalla (50%) */}
      <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30 flex items-center p-1 bg-gray-100 rounded-full border border-gray-200 shadow-lg overflow-x-auto max-w-[90vw]">
        {CONTENT_TYPES.map(t => {
          const isActive = contentType === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setContentType(t.id)}
              className={`relative px-4 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-300 ${
                isActive ? 'text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="activeTabCompare"
                  className="absolute inset-0 bg-white rounded-full shadow-sm"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div ref={panesRef} className="relative flex-1 flex flex-col md:flex-row overflow-hidden">
        <div
          style={{ width: leftWidth }}
          className="relative w-full md:w-1/2 h-1/2 md:h-full border-b md:border-b-0 md:border-r border-gray-200 bg-gray-100 overflow-hidden"
        >
          <ComparePaneContent unit={unit} contentType={contentType} />
          {/* Badge A */}
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-1.5 pr-4 py-1.5 shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
            <span className="text-[11px] font-bold text-gray-900 tracking-wide uppercase">
              {unit.name} <span className="text-gray-400 font-medium">· {unit.modelName}</span>
            </span>
          </div>
        </div>

        <div
          style={{ width: rightWidth }}
          className="relative w-full md:w-1/2 h-1/2 md:h-full bg-gray-100 overflow-hidden"
        >
          {compareUnit ? (
            <>
              <ComparePaneContent unit={compareUnit} contentType={contentType} />
              {/* Badge B */}
              <div className="absolute top-5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 bg-white border border-gray-200 rounded-full pl-1.5 pr-4 py-1.5 shadow-lg">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-bold text-gray-900 tracking-wide uppercase">
                  {compareUnit.name} <span className="text-gray-400 font-medium">· {compareUnit.modelName}</span>
                </span>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-50">
              <button
                onClick={() => setPickerOpen(true)}
                className="flex items-center gap-3 px-6 py-3 rounded-full bg-white border border-gray-200 text-[13px] font-bold text-gray-900 hover:bg-gray-50 transition-all shadow-2xl hover:scale-105 active:scale-95"
              >
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="4" width="7.5" height="16" rx="1" />
                  <rect x="13.5" y="4" width="7.5" height="16" rx="1" />
                </svg>
                Elegir Unidad a Comparar
              </button>
            </div>
          )}
        </div>

        {showSlider && (
          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{ left: `${splitPercent}%` }}
            className="hidden md:block absolute top-0 bottom-0 z-20 w-8 -translate-x-1/2 cursor-ew-resize touch-none group"
          >
            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[1px] bg-gray-300 group-hover:bg-gray-400 transition-colors pointer-events-none" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white border border-gray-200 shadow-lg flex items-center justify-center pointer-events-none group-hover:scale-110 transition-transform">
              <span className="text-[10px] font-black text-gray-600 tracking-widest leading-none mt-[1px]">VS</span>
            </div>
          </div>
        )}
      </div>

      {compareUnit && (
        <div className="flex-shrink-0">
          <div className="flex justify-center bg-gray-100">
            <button
              onClick={() => setMetricsVisible(v => !v)}
              aria-expanded={metricsVisible}
              aria-label={metricsVisible ? 'Ocultar datos de comparación' : 'Mostrar datos de comparación'}
              className="relative z-10 -mb-px flex items-center gap-1.5 px-4 py-1.5 rounded-t-lg bg-white border border-b-0 border-gray-200 shadow-sm text-xs font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              {metricsVisible ? 'Ocultar datos' : 'Ver datos'}
              <svg
                className={`w-3.5 h-3.5 transition-transform duration-200 ${metricsVisible ? '' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
          </div>
          <AnimatePresence initial={false}>
            {metricsVisible && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="overflow-hidden"
              >
                <CompareMetricsBar unitA={unit} unitB={compareUnit} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {pickerOpen && (
        <div className="absolute inset-0 z-40 bg-black/40 flex justify-end" onClick={() => setPickerOpen(false)}>
          <ComparePicker
            baseUnit={unit}
            candidates={candidates}
            onSelect={u => { setCompareUnitId(u.id); setPickerOpen(false); }}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}
    </motion.div>
  );
}
