'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { getImageProps } from 'next/image';
import { m as motion, AnimatePresence, useReducedMotion, type Variants } from 'framer-motion';
import {
  ELEVATOR_EASE,
  floorDirection,
  floorSteps,
  floorTransitionMs,
  type FloorDirection,
} from '@/lib/floor-transition';

// Laboratorio del cambio de piso (solo desarrollo — ver
// app/prototipos/cambio-de-piso). Tres variantes de movimiento sobre los
// planos reales, con lo mismo debajo: precarga de todos los planos (el
// plano viejo queda en pantalla hasta que el nuevo está decodificado, nunca
// un hueco en blanco), riel con indicador que viaja, número de piso que
// rueda en la misma dirección, teclado (↑/↓), anuncio para lector de
// pantalla y "reducir movimiento".

export interface LabFloor {
  number: number;
  name: string;
  planImage: string;
  units: number;
  available: number;
}

type VariantKey = 'ascensor' | 'capas' | 'corte' | 'profundidad';

const VARIANTS: { key: VariantKey; title: string; blurb: string }[] = [
  { key: 'ascensor', title: 'A · Ascensor', blurb: 'La cámara sube o baja: el piso que dejás sale por un borde y el nuevo entra por el opuesto.' },
  { key: 'capas', title: 'B · Pisos apilados', blurb: 'Los pisos son capas en perspectiva: el que dejás se hunde o se eleva, el nuevo aparece desde la otra capa.' },
  { key: 'corte', title: 'C · Corte del edificio', blurb: 'Un corte lateral muestra dónde estás; la cabina viaja por él y el plano cambia con un desplazamiento corto.' },
  { key: 'profundidad', title: 'D · Profundidad', blurb: 'Vista desde arriba: al subir, el piso que dejás se aleja y el nuevo llega desde más cerca. Sin deslizar el plano.' },
];

const PLAN_SIZES = '(max-width: 768px) 100vw, 1100px';

function planProps(src: string) {
  return getImageProps({ src, alt: '', fill: true, sizes: PLAN_SIZES }).props;
}

// Precarga + decodificación de todos los planos: el cambio de piso nunca
// espera una descarga. Mismo srcSet/sizes que el <img> del escenario, así
// el navegador reutiliza la imagen ya decodificada.
function usePreloadedPlans(floors: LabFloor[]) {
  const [ready, setReady] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    for (const f of floors) {
      const p = planProps(f.planImage);
      const img = new window.Image();
      if (p.sizes) img.sizes = p.sizes;
      if (p.srcSet) img.srcset = p.srcSet;
      img.src = p.src;
      img.decode()
        .catch(() => undefined)
        .then(() => { if (alive) setReady(prev => new Set(prev).add(f.planImage)); });
    }
    return () => { alive = false; };
  }, [floors]);
  return ready;
}

// La capa que sale conserva las props de su último render: si la duración
// viajara en `transition`, saldría con la del viaje anterior (0 ms en el
// primer cambio — el plano viejo desaparecía de golpe). Por eso dirección
// y duración viajan juntas en `custom`, que AnimatePresence actualiza
// también en la capa que sale.
interface Trip { dir: FloorDirection; ms: number }

const tripTransition = (c: Trip) => ({ duration: c.ms / 1000, ease: ELEVATOR_EASE });

function planVariants(variant: VariantKey, reduced: boolean): Variants {
  if (reduced) {
    return {
      enter: { opacity: 0 },
      center: (c: Trip) => ({ opacity: 1, y: '0%', transition: tripTransition(c) }),
      exit: (c: Trip) => ({ opacity: 0, transition: tripTransition(c) }),
    };
  }
  // Subir = la cámara se eleva = el mundo baja: el piso que dejás sale por
  // abajo y el nuevo entra desde arriba. Bajar, al revés.
  if (variant === 'ascensor') {
    return {
      enter: (c: Trip) => ({ y: c.dir >= 0 ? '-38%' : '38%', opacity: 0 }),
      center: (c: Trip) => ({ y: '0%', opacity: 1, transition: tripTransition(c) }),
      exit: (c: Trip) => ({ y: c.dir >= 0 ? '38%' : '-38%', opacity: 0, transition: tripTransition(c) }),
    };
  }
  if (variant === 'capas') {
    return {
      enter: (c: Trip) => ({ y: c.dir >= 0 ? '-24%' : '24%', scale: c.dir >= 0 ? 1.08 : 0.9, rotateX: c.dir >= 0 ? -16 : 16, opacity: 0 }),
      center: (c: Trip) => ({ y: '0%', scale: 1, rotateX: 0, opacity: 1, transition: tripTransition(c) }),
      exit: (c: Trip) => ({ y: c.dir >= 0 ? '24%' : '-24%', scale: c.dir >= 0 ? 0.9 : 1.08, rotateX: c.dir >= 0 ? 16 : -16, opacity: 0, transition: tripTransition(c) }),
    };
  }
  if (variant === 'profundidad') {
    // Cámara cenital: el plano no se desliza (deslizar en una vista desde
    // arriba es moverse al norte o al sur). Subir acerca el piso nuevo a
    // la cámara: llega más grande y se asienta; el que dejás se aleja.
    return {
      enter: (c: Trip) => ({ scale: c.dir >= 0 ? 1.12 : 0.88, opacity: 0 }),
      center: (c: Trip) => ({ scale: 1, opacity: 1, transition: tripTransition(c) }),
      exit: (c: Trip) => ({ scale: c.dir >= 0 ? 0.88 : 1.12, opacity: 0, transition: tripTransition(c) }),
    };
  }
  return {
    enter: (c: Trip) => ({ y: c.dir >= 0 ? '-7%' : '7%', opacity: 0 }),
    center: (c: Trip) => ({ y: '0%', opacity: 1, transition: tripTransition(c) }),
    exit: (c: Trip) => ({ y: c.dir >= 0 ? '7%' : '-7%', opacity: 0, transition: tripTransition(c) }),
  };
}

function tickerVariants(reduced: boolean): Variants {
  if (reduced) return planVariants('ascensor', true);
  // ±35% y no ±100%: el número no sale nunca de la píldora, aunque el
  // navegador no recorte la capa animada (pasaba en Chrome con el recorte
  // por overflow). La dirección se sigue leyendo.
  return {
    enter: (c: Trip) => ({ y: c.dir >= 0 ? '-35%' : '35%', opacity: 0 }),
    center: (c: Trip) => ({ y: '0%', opacity: 1, transition: tripTransition(c) }),
    exit: (c: Trip) => ({ y: c.dir >= 0 ? '35%' : '-35%', opacity: 0, transition: tripTransition(c) }),
  };
}

declare global {
  interface Window {
    __floorLab?: { requested: number; t: number; settled?: number }[];
  }
}

export default function FloorTransitionLab({ floors, projectName, initialVariant }: {
  floors: LabFloor[]; // de arriba hacia abajo
  projectName: string;
  initialVariant?: string;
}) {
  const [variant, setVariant] = useState<VariantKey>(
    VARIANTS.some(v => v.key === initialVariant) ? (initialVariant as VariantKey) : 'ascensor',
  );
  const systemReduced = useReducedMotion();
  const [forceReduced, setForceReduced] = useState(false);
  const reduced = !!systemReduced || forceReduced;

  const order = useMemo(() => floors.map(f => f.number).slice().reverse(), [floors]); // de abajo hacia arriba
  const ready = usePreloadedPlans(floors);
  const startFloor = floors.find(f => f.number === 1)?.number ?? floors[floors.length - 1]?.number ?? 0;

  const [requested, setRequested] = useState(startFloor);
  // Lo que se muestra cambia recién cuando el plano pedido está listo —
  // hasta entonces queda el anterior (nunca un hueco en blanco). Ajuste
  // durante el render, no en un efecto (react-hooks/set-state-in-effect).
  const [shown, setShown] = useState({ number: startFloor, dir: 0 as FloorDirection, steps: 0 });
  const requestedFloor = floors.find(f => f.number === requested);
  if (requestedFloor && requested !== shown.number && ready.has(requestedFloor.planImage)) {
    setShown({
      number: requested,
      dir: floorDirection(shown.number, requested),
      steps: floorSteps(order, shown.number, requested),
    });
  }
  const shownFloor = floors.find(f => f.number === shown.number)!;
  const ms = floorTransitionMs(shown.steps, reduced);
  const trip: Trip = { dir: shown.dir, ms };
  const transition = tripTransition(trip);
  const waiting = requested !== shown.number;

  const go = useCallback((num: number) => {
    window.__floorLab = [...(window.__floorLab ?? []), { requested: num, t: performance.now() }];
    setRequested(num);
  }, []);

  const onRailKey = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const i = order.indexOf(requested);
    const next = order[Math.max(0, Math.min(order.length - 1, i + (e.key === 'ArrowUp' ? 1 : -1)))];
    if (next !== undefined) go(next);
  };

  const pv = planVariants(variant, reduced);
  const plan = planProps(shownFloor.planImage);
  const railIndex = floors.findIndex(f => f.number === shown.number);

  return (
    <div className="min-h-screen bg-[#141514] text-[#EEECE7] font-[family-name:var(--font-montserrat)]" data-variant={variant}>
      <header className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-4 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-lg sm:text-xl font-semibold">Cambio de piso · laboratorio <span className="text-[#A9A69F] font-normal">— {projectName}</span></h1>
          <label className="flex items-center gap-2 text-sm text-[#A9A69F] cursor-pointer">
            <input type="checkbox" checked={forceReduced} onChange={e => setForceReduced(e.target.checked)} className="accent-[#BBA98E]" />
            Simular «reducir movimiento»{systemReduced ? ' (activo en el sistema)' : ''}
          </label>
        </div>
        <div role="tablist" aria-label="Variante" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {VARIANTS.map(v => (
            <button
              key={v.key}
              role="tab"
              aria-selected={variant === v.key}
              onClick={() => setVariant(v.key)}
              className={`text-left p-3 rounded-xl border transition-colors ${
                variant === v.key ? 'border-[#BBA98E] bg-white/[.06]' : 'border-white/10 hover:bg-white/[.03]'
              }`}
            >
              <span className="block text-sm font-semibold">{v.title}</span>
              <span className="block mt-1 text-xs leading-relaxed text-[#A9A69F]">{v.blurb}</span>
            </button>
          ))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pb-10">
        <div className="relative flex h-[70vh] min-h-[420px] rounded-2xl overflow-hidden bg-white text-gray-900">
          {/* Corte del edificio (variante C): la cabina viaja por los pisos. */}
          {variant === 'corte' && (
            <div aria-hidden="true" className="hidden sm:flex w-[92px] shrink-0 border-r border-gray-100 py-6 px-4 flex-col justify-center">
              <div className="relative flex flex-col gap-1.5">
                {floors.map(f => (
                  <span key={f.number} className="h-7 rounded-[4px] bg-gray-100 text-[10px] font-semibold text-gray-400 flex items-center justify-center">
                    {f.number === 0 ? 'PB' : f.number}
                  </span>
                ))}
                <motion.span
                  className="absolute left-0 right-0 h-7 rounded-[4px] bg-gray-900 text-white text-[10px] font-semibold flex items-center justify-center shadow-md"
                  initial={false}
                  animate={{ y: railIndex * (28 + 6) }}
                  transition={transition}
                >
                  {shown.number === 0 ? 'PB' : shown.number}
                </motion.span>
              </div>
            </div>
          )}

          {/* Escenario del plano */}
          <div className="relative flex-1 min-w-0 overflow-hidden" style={variant === 'capas' && !reduced ? { perspective: 1400 } : undefined}>
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
              {/* El número que sale y el que entra comparten la misma celda de
                  la grilla (se superponen sin sacarlos de flujo), y la
                  píldora los recorta. */}
              <span className="h-9 px-3.5 rounded-full bg-gray-900 text-white text-sm font-semibold grid items-center overflow-hidden">
                <AnimatePresence initial={false} custom={trip}>
                  <motion.span
                    key={shown.number}
                    custom={trip}
                    variants={tickerVariants(reduced)}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="[grid-area:1/1] whitespace-nowrap"
                  >
                    {shownFloor.name}
                  </motion.span>
                </AnimatePresence>
              </span>
              {waiting && <span className="text-xs text-gray-400">cargando plano…</span>}
            </div>

            <AnimatePresence initial={false} custom={trip}>
              <motion.div
                key={shown.number}
                data-plan={shown.number}
                custom={trip}
                variants={pv}
                initial="enter"
                animate="center"
                exit="exit"
                onAnimationComplete={def => {
                  if (def !== 'center') return;
                  const log = window.__floorLab;
                  const last = log?.[log.length - 1];
                  if (last && last.requested === shown.number && last.settled == null) last.settled = performance.now();
                }}
                className="absolute inset-0 p-6 sm:p-10 will-change-transform"
                style={{ transformOrigin: '50% 50%' }}
              >
                <div className="relative w-full h-full">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={plan.src}
                    srcSet={plan.srcSet}
                    sizes={plan.sizes}
                    alt={`Plano de ${shownFloor.name}`}
                    decoding="async"
                    className="absolute inset-0 w-full h-full object-contain select-none"
                    draggable={false}
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Riel de pisos: el indicador viaja con la misma curva que el plano. */}
          <nav
            aria-label="Pisos"
            onKeyDown={onRailKey}
            className="w-[76px] shrink-0 border-l border-gray-100 py-4 flex flex-col items-center"
          >
            <span className="text-[9px] tracking-[0.2em] text-gray-400 mb-2">PISO</span>
            <div className="relative flex flex-col gap-1">
              <motion.span
                aria-hidden="true"
                className="absolute left-0 top-0 w-14 h-12 rounded-xl bg-gray-900"
                initial={false}
                animate={{ y: railIndex * (48 + 4) }}
                transition={transition}
              />
              {floors.map(f => {
                const active = f.number === shown.number;
                return (
                  <button
                    key={f.number}
                    type="button"
                    onClick={() => go(f.number)}
                    aria-current={active ? 'true' : undefined}
                    aria-label={`${f.name}${f.units ? ` · ${f.available} disponibles` : ''}`}
                    className={`relative w-14 h-12 rounded-xl flex flex-col items-center justify-center transition-colors duration-200 ${
                      active ? 'text-white' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className="text-sm font-semibold">{f.number === 0 ? 'PB' : f.number}</span>
                    {f.units > 0 && (
                      <span className={`text-[9px] ${active ? 'text-white/70' : 'text-emerald-600'}`}>{f.available} libres</span>
                    )}
                  </button>
                );
              })}
            </div>
          </nav>

          <p className="sr-only" aria-live="polite">{shownFloor.name}</p>
        </div>

        <p className="mt-4 text-xs text-[#A9A69F]">
          Duración: {floorTransitionMs(1, reduced)} ms un piso, hasta {floorTransitionMs(99, reduced)} ms saltando varios · curva tipo ascensor
          (arranca lento, frena suave) · ↑/↓ sobre el riel para cambiar de piso.
        </p>
      </main>
    </div>
  );
}
