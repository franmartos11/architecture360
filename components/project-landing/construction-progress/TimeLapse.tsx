'use client';

import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { m, useReducedMotion } from 'framer-motion';
import { formatUpdateDate, stageLabelOf } from '@/lib/construction-progress';
import { frameHasAngle, lapseAngles, type LapseFrame } from '@/lib/construction-progress-view';
import { focusQuiet, getFocusables } from '@/lib/focus';
import type { ConstructionProgress } from '@/types';

const FRAME_MS = 1400;
/** Tope de un clip como cuadro: avanza al terminar o a los 6 s, lo que pase primero. */
const CLIP_MAX_MS = 6000;
/** Cuadros por delante del actual que ya se montan (precarga), no todos de una. */
const PRELOAD_AHEAD = 3;

/**
 * Time-lapse: todos los cuadros en orden, a pantalla completa, como una
 * película corta. Donde más luce es con fotos del mismo ángulo, así que si
 * hay al menos dos ángulos con dos o más cuadros cada uno aparecen chips
 * para quedarse con uno ("Todos" por defecto).
 *
 * Foco: el diálogo se maneja solo con lib/focus en vez de con <Dialog>.
 * Dialog está pensado para paneles con cabecera, cuerpo que scrollea y
 * pie, sobre fondo atenuado y con entrada a escala; acá es una película
 * negra de borde a borde con sus propias teclas (flechas, Escape) y su
 * fundido. Hacerle una variante "pantalla completa" tocaba la forma, el
 * fondo, la animación y el cuerpo — cuatro ramas en una pieza que usan
 * todos los modales del panel. Lo que importa de Dialog (foco inicial,
 * Tab atrapado, Escape, devolver el foco al cerrar) son veinte líneas.
 */
export default function TimeLapse({ progress, frames: allFrames, start, onClose }: {
  progress: ConstructionProgress;
  frames: LapseFrame[];
  /** Índice en `frames` (sin filtro) por el que arranca. */
  start: number;
  onClose: () => void;
}) {
  const angles = useMemo(() => lapseAngles(allFrames), [allFrames]);
  const [angle, setAngle] = useState<string | null>(null);
  const frames = useMemo(() => (angle ? allFrames.filter(f => frameHasAngle(f, angle)) : allFrames), [allFrames, angle]);
  const [i, setI] = useState(start);
  const [playing, setPlaying] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reduce = useReducedMotion();

  const f = frames[i];
  // Con movimiento reducido el clip queda quieto (poster o primer
  // fotograma) y dura lo que una foto.
  const playsClip = !!f?.video && !reduce;

  // Avanza solo; en el último se detiene (no loopea: el final es el estado
  // de hoy). `running` se deriva para no tener que apagar `playing` a mano.
  const atEnd = i >= frames.length - 1;
  const running = playing && !atEnd;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI(x => x + 1), playsClip ? CLIP_MAX_MS : FRAME_MS);
    return () => clearTimeout(t);
  }, [running, i, playsClip]);

  // El clip sigue a la pausa: pausar el time-lapse pausa el video.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (playing) v.play()?.catch(() => {});
    else v.pause();
  }, [playing, i, playsClip]);

  const step = useCallback((d: number) => { setPlaying(false); setI(x => Math.min(frames.length - 1, Math.max(0, x + d))); }, [frames.length]);
  const toggle = () => {
    if (running) { setPlaying(false); return; }
    if (atEnd) setI(0);
    setPlaying(true);
  };
  // Cambiar de ángulo es otra película: arranca desde su primer cuadro.
  const chooseAngle = (a: string | null) => { setAngle(a); setI(0); setPlaying(true); };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowRight') { step(1); return; }
    if (e.key === 'ArrowLeft') { step(-1); return; }
    if (e.key !== 'Tab') return;
    // Tab atrapado, como en Dialog: del último vuelve al primero y al revés.
    const root = rootRef.current;
    if (!root) return;
    const items = getFocusables(root);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!root.contains(active)) { e.preventDefault(); focusQuiet(e.shiftKey ? last : first); }
    else if (e.shiftKey && active === first) { e.preventDefault(); focusQuiet(last); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); focusQuiet(first); }
  });

  // Solo al abrir y cerrar: si dependiera de `step`, cambiar de ángulo
  // volvería a llevar el foco a Cerrar en medio de los chips.
  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    focusQuiet(closeRef.current);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const listener = (e: KeyboardEvent) => onKey(e);
    document.addEventListener('keydown', listener);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', listener);
      if (prevFocus && prevFocus !== document.body && prevFocus.isConnected) focusQuiet(prevFocus);
    };
  }, []);

  if (!f) return null;
  const stage = stageLabelOf(progress, f.update.stageId);
  // Una marca por entrada en la línea de tiempo (no por cuadro): con
  // muchas fotos, 60 tramos serían ilegibles.
  const marks = frames.reduce<{ id: string; date: string; title: string; first: number; last: number }[]>((acc, fr, k) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.id === fr.update.id) prev.last = k;
    else acc.push({ id: fr.update.id, date: fr.update.date, title: fr.update.title, first: k, last: k });
    return acc;
  }, []);
  const frameMs = playsClip ? CLIP_MAX_MS : FRAME_MS;

  return (
    <m.div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Time-lapse de la obra"
      className="fixed inset-0 z-[70] bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.12 : 0.3 }}
    >
      {frames.map((fr, k) => (
        // Se montan el actual, los ya vistos y unos pocos por delante
        // (precarga), y se cruzan por opacidad: sin parpadeo entre cuadros.
        k <= i + PRELOAD_AHEAD && (
          <div
            key={fr.key}
            data-testid="lapse-frame"
            data-angle={fr.update.view ?? ''}
            className="absolute inset-0 transition-opacity ease-linear"
            style={{ opacity: k === i ? 1 : 0, transitionDuration: reduce ? '0ms' : '700ms' }}
            aria-hidden={k !== i}
          >
            <FrameMedia frame={fr} current={k === i} playsClip={k === i && playsClip} priority={k === start} videoRef={videoRef} onClipEnd={() => { if (running) setI(x => x + 1); }} />
          </div>
        )
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/40 pointer-events-none" />

      <div className="absolute top-4 inset-x-4 sm:top-6 sm:inset-x-6 flex items-start justify-between gap-4">
        {angles.length > 0 ? (
          <div role="group" aria-label="Ángulo" className="flex flex-wrap gap-1.5">
            {[null, ...angles].map(a => {
              const on = a === angle;
              return (
                <button
                  key={a ?? 'todos'}
                  type="button"
                  onClick={() => chooseAngle(a)}
                  aria-pressed={on}
                  className={`h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors ${on ? 'bg-white text-black' : 'bg-black/35 backdrop-blur-md border border-white/25 text-white hover:bg-black/55'}`}
                >
                  {a ?? 'Todos'}
                </button>
              );
            })}
          </div>
        ) : <span />}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar time-lapse"
          className="shrink-0 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center hover:bg-white/25 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="absolute inset-x-0 bottom-0 px-4 sm:px-10 pb-6 sm:pb-10 flex flex-col gap-5">
        <div aria-live="polite" className="flex flex-col gap-1">
          {(stage || f.update.view) && (
            <span className="text-xs tracking-[0.2em] uppercase text-white/70">{[stage, f.update.view].filter(Boolean).join(' · ')}</span>
          )}
          <span className="font-[family-name:var(--theme-font-heading)] text-[clamp(36px,6vw,80px)] leading-none font-medium tracking-[-0.04em]">{formatUpdateDate(f.update.date)}</span>
          {f.update.title && <span className="text-base sm:text-lg text-white/85">{f.update.title}</span>}
        </div>

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={toggle}
            aria-label={running ? 'Pausar' : 'Reproducir'}
            className="shrink-0 w-12 h-12 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform"
          >
            {running
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>}
          </button>
          {/* Línea de tiempo: un tramo por entrada, se llena a medida que pasan sus cuadros. */}
          <div className="flex-1 flex gap-1.5 min-w-0">
            {marks.map(mk => {
              const count = mk.last - mk.first + 1;
              const isCurrent = i >= mk.first && i <= mk.last;
              // Lo ya recorrido de este tramo, sin contar el cuadro actual.
              const before = i > mk.last ? 1 : i < mk.first ? 0 : (i - mk.first) / count;
              const animating = isCurrent && running && !reduce;
              return (
                <button
                  key={mk.id}
                  type="button"
                  onClick={() => { setPlaying(false); setI(mk.first); }}
                  aria-label={`${formatUpdateDate(mk.date)}${mk.title ? `: ${mk.title}` : ''}`}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="flex-1 min-w-0 py-3 group"
                >
                  <span className="block h-1 rounded-full bg-white/25 overflow-hidden">
                    <span
                      key={animating ? `run-${i}` : 'still'}
                      className={`block h-full bg-white origin-left ${animating ? 'lapse-run' : ''}`}
                      style={animating
                        ? { ['--lapse-from' as string]: before, ['--lapse-to' as string]: before + 1 / count, ['--lapse-ms' as string]: `${frameMs}ms` }
                        : { transform: `scaleX(${isCurrent ? before + 1 / count : before})` }}
                    />
                  </span>
                  <span className="hidden sm:block mt-2 text-[11px] text-white/60 group-hover:text-white text-left tabular-nums truncate">{formatUpdateDate(mk.date)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </m.div>
  );
}

/**
 * Lo que se ve en un cuadro. El clip se reproduce solo en el cuadro
 * actual (sin loop: al terminar pasa al siguiente); fuera de él, o con
 * movimiento reducido, queda su poster — o el clip quieto en el primer
 * fotograma si la entrada no tiene fotos.
 */
function FrameMedia({ frame, current, playsClip, priority, videoRef, onClipEnd }: {
  frame: LapseFrame;
  current: boolean;
  playsClip: boolean;
  priority: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onClipEnd: () => void;
}) {
  const alt = current ? (frame.update.title || 'Avance de obra') : '';
  if (frame.video && playsClip) {
    return (
      <video
        ref={videoRef}
        src={frame.video}
        poster={frame.image}
        muted
        playsInline
        autoPlay
        onEnded={onClipEnd}
        aria-label={alt || undefined}
        className="absolute inset-0 w-full h-full object-cover"
      />
    );
  }
  if (frame.image) return <Image src={frame.image} alt={alt} fill sizes="100vw" className="object-cover" priority={priority} />;
  if (frame.video) return <video src={frame.video} muted playsInline preload="auto" aria-label={alt || undefined} className="absolute inset-0 w-full h-full object-cover" />;
  return null;
}
