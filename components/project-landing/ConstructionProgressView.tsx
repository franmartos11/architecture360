'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { AnimatePresence, animate, m, useInView, useMotionValueEvent, useReducedMotion, useScroll } from 'framer-motion';
import { shimmerDataUrl } from '@/lib/imagePlaceholder';
import { currentStageIndex, formatUpdateDate, stageLabelOf, visibleUpdates } from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { Container, Pill, SectionHeading } from './ui';

/**
 * Avance de obra. Tres piezas, cada una aparece solo si tiene datos:
 * 1. Resumen: porcentaje que cuenta hasta su valor al entrar en pantalla,
 *    entrega estimada y la tira de etapas (hechas, en curso, pendientes).
 * 2. Historia: en pantallas anchas la foto queda fija y, al scrollear, va
 *    pasando de una actualización a la siguiente con un fundido; a la
 *    izquierda se marca la que se está viendo. En mobile (y sin
 *    movimiento) es un carrusel para deslizar, la más nueva primero.
 * 3. Time-lapse: todas las fotos en orden, a pantalla completa, como una
 *    película corta (con fotos del mismo ángulo es donde más luce).
 *
 * Es igual para cualquier tipo de proyecto: las etapas las define el admin.
 */
export default function ConstructionProgressView({ progress }: { progress: ConstructionProgress }) {
  const reduce = useReducedMotion();
  const updates = useMemo(() => visibleUpdates(progress), [progress]);
  const frames = useMemo(() => updates.flatMap(u => u.images.map(image => ({ update: u, image }))), [updates]);
  const [lapseAt, setLapseAt] = useState<number | null>(null);
  // Abre el time-lapse en la primera foto de una actualización (o desde el principio).
  const openLapse = (updateId?: string) => setLapseAt(Math.max(0, updateId ? frames.findIndex(f => f.update.id === updateId) : 0));

  const last = updates[updates.length - 1];

  return (
    <section id="avance" className="py-[calc(var(--theme-spacing)/2)] bg-[var(--theme-bg)] text-[var(--theme-text)]">
      <Container>
        <SectionHeading
          eyebrow="Avance de obra"
          title="Así va la obra."
          muted={last ? `Actualizado ${formatUpdateDate(last.date)}.` : undefined}
          className="mb-12"
        />
        <Summary progress={progress} onLapse={frames.length > 2 ? () => openLapse() : undefined} />
      </Container>

      {updates.length > 0 && (
        <>
          {!reduce && <StoryScroll progress={progress} updates={updates} onMore={openLapse} />}
          <Container className={reduce ? 'mt-12' : 'mt-12 lg:hidden'}>
            <StoryCarousel progress={progress} updates={updates} />
          </Container>
        </>
      )}

      <AnimatePresence>
        {lapseAt != null && <TimeLapse progress={progress} frames={frames} start={lapseAt} onClose={() => setLapseAt(null)} />}
      </AnimatePresence>
    </section>
  );
}

// ─── 1. Resumen ──────────────────────────────────────────────────────

function Summary({ progress, onLapse }: { progress: ConstructionProgress; onLapse?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -15% 0px' });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(0);
  const percent = progress.percent;
  const current = currentStageIndex(progress);

  useEffect(() => {
    if (!inView || reduce || percent == null) return;
    const c = animate(0, percent, { duration: 1.6, ease: [0.16, 1, 0.3, 1], onUpdate: v => setShown(Math.round(v)) });
    return () => c.stop();
  }, [inView, reduce, percent]);
  // Sin movimiento, el número aparece directo en su valor.
  const value = reduce ? percent : shown;

  const hasStages = progress.stages.length > 0;
  const currentLabel = current >= 0 ? progress.stages[current]?.label : undefined;
  const hasLeft = percent != null || !!currentLabel || !!progress.deliveryEstimate || !!onLapse;
  if (!hasLeft && !hasStages) return null;

  return (
    <div ref={ref} className={`grid gap-10 lg:items-end ${hasLeft && hasStages ? 'lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : ''}`}>
      {hasLeft && (
        <div className="flex flex-col gap-5">
          {(percent != null || currentLabel) && (
            <div className="flex items-end gap-6 flex-wrap">
              {percent != null && (
                <span className="font-[family-name:var(--theme-font-heading)] text-[clamp(72px,9vw,132px)] leading-[0.85] font-medium tracking-[-0.05em] tabular-nums">
                  {value}<span className="text-[0.45em] text-[var(--theme-text-muted)] ml-1">%</span>
                </span>
              )}
              {currentLabel && (
                <div className="pb-2 flex flex-col gap-1">
                  <span className="text-sm text-[var(--theme-text-muted)]">Etapa actual</span>
                  <span className="text-lg font-semibold">{currentLabel}</span>
                </div>
              )}
            </div>
          )}
          {percent != null && (
            <div className="h-1.5 rounded-full bg-[var(--theme-border)] overflow-hidden" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Avance general de la obra">
              <m.div
                className="h-full rounded-full bg-[var(--theme-accent)] origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: inView ? percent / 100 : 0 }}
                transition={{ duration: reduce ? 0 : 1.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          )}
          {(progress.deliveryEstimate || onLapse) && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 justify-between">
              {progress.deliveryEstimate && (
                <span className="text-[15px]"><span className="text-[var(--theme-text-muted)]">Entrega estimada · </span><span className="font-semibold">{progress.deliveryEstimate}</span></span>
              )}
              {onLapse && <Pill onClick={onLapse} variant="ghost" arrow>Ver time-lapse</Pill>}
            </div>
          )}
        </div>
      )}

      {hasStages && (
        <ol
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${progress.stages.length}, minmax(0, 1fr))` }}
          aria-label="Etapas de la obra"
        >
          {progress.stages.map((s, i) => {
            const done = current >= 0 && i < current;
            const active = i === current;
            return (
              <li key={s.id} className="flex flex-col gap-3 min-w-0" aria-current={active ? 'step' : undefined}>
                <div className="h-1 rounded-full bg-[var(--theme-border)] overflow-hidden">
                  <m.div
                    className="h-full bg-[var(--theme-text)] origin-left"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: inView ? (done ? 1 : active ? 0.5 : 0) : 0 }}
                    transition={{ duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.25 + i * 0.18, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <span className="flex flex-col sm:flex-row sm:items-start gap-1.5 min-w-0">
                  <StageDot done={done} active={active} />
                  <span className={`text-[11px] sm:text-sm leading-tight hyphens-auto break-words ${done || active ? 'font-semibold' : 'text-[var(--theme-text-muted)]'}`}>{s.label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function StageDot({ done, active }: { done: boolean; active: boolean }) {
  if (done) {
    return (
      <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--theme-text)] text-[var(--theme-bg)] flex items-center justify-center" aria-label="Terminada">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    );
  }
  if (active) {
    return (
      <span className="relative shrink-0 w-4 h-4 flex items-center justify-center" aria-label="En curso">
        <span className="absolute inset-0 rounded-full bg-[var(--theme-accent)] opacity-40 motion-safe:animate-ping" />
        <span className="relative w-2.5 h-2.5 rounded-full bg-[var(--theme-accent)]" />
      </span>
    );
  }
  return <span className="shrink-0 w-4 h-4 rounded-full border border-[var(--theme-border)]" aria-label="Pendiente" />;
}

/** "Excavación · Texto…" — la etapa y el texto, lo que haya. */
function detailLine(progress: ConstructionProgress, u: ConstructionUpdate): string {
  return [stageLabelOf(progress, u.stageId), u.body].filter(Boolean).join(' · ');
}

// ─── 2a. Historia con scroll (pantallas anchas) ──────────────────────

function StoryScroll({ progress, updates, onMore }: { progress: ConstructionProgress; updates: ConstructionUpdate[]; onMore: (updateId: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = updates.length;
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', v => setActive(Math.min(n - 1, Math.max(0, Math.floor(v * n)))));

  // Click en una actualización: scrollea hasta el tramo que la muestra.
  const goTo = (i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * ((i + 0.5) / n), behavior: 'smooth' });
  };

  const u = updates[Math.min(active, n - 1)];
  const stage = stageLabelOf(progress, u.stageId);

  return (
    <div ref={trackRef} className="relative hidden lg:block mt-16" style={{ height: `${n * 70 + 30}vh` }}>
      <div className="sticky top-16 h-[calc(100svh-4rem)] flex items-center">
        <Container className="w-full grid grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-12 items-center">
          {/* Con muchas actualizaciones la lista se scrollea sola dentro de la columna. */}
          <ol className="flex flex-col max-h-[calc(100svh-9rem)] overflow-y-auto [scrollbar-width:thin]">
            {updates.map((up, i) => {
              const on = i === active;
              const detail = detailLine(progress, up);
              return (
                <li key={up.id}>
                  <button
                    type="button"
                    onClick={() => goTo(i)}
                    aria-current={on ? 'step' : undefined}
                    className="group w-full text-left flex gap-4 py-3.5 border-t border-[var(--theme-border)]"
                  >
                    <span className={`shrink-0 w-[72px] pt-0.5 text-[13px] tabular-nums transition-colors duration-500 ${on ? 'text-[var(--theme-text)] font-semibold' : 'text-[var(--theme-text-muted)]'}`}>
                      {formatUpdateDate(up.date)}
                    </span>
                    <span className="min-w-0 flex flex-col gap-1">
                      <span className={`text-[17px] leading-snug font-medium transition-colors duration-500 ${on ? 'text-[var(--theme-text)]' : 'text-[var(--theme-text-muted)] group-hover:text-[var(--theme-text)]'}`}>
                        {up.title || stageLabelOf(progress, up.stageId) || 'Actualización'}
                      </span>
                      {/* El texto se abre solo en la activa: la lista se lee de un vistazo. */}
                      {detail && (
                        <span className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.16,1,.3,1)] ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                          <span className="overflow-hidden text-sm leading-relaxed text-[var(--theme-text-muted)]">
                            <span className="block pt-1 whitespace-pre-line">{detail}</span>
                          </span>
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div className="relative aspect-[4/3] max-h-[calc(100svh-9rem)] w-full rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
            <AnimatePresence initial={false}>
              <m.div
                key={u.id}
                className="absolute inset-0"
                initial={{ opacity: 0, scale: 1.08 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ opacity: { duration: 0.8 }, scale: { duration: 2.4, ease: [0.16, 1, 0.3, 1] } }}
              >
                <Image src={u.images[0]} alt={u.title || 'Avance de obra'} fill sizes="60vw" placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover" />
              </m.div>
            </AnimatePresence>
            {u.images.length > 1 && (
              <button
                type="button"
                onClick={() => onMore(u.id)}
                className="absolute top-4 right-4 px-3.5 py-1.5 rounded-full text-[13px] font-semibold bg-black/45 backdrop-blur-md border border-white/25 text-white hover:bg-black/60 transition-colors"
              >
                +{u.images.length - 1} {u.images.length === 2 ? 'foto' : 'fotos'}
              </button>
            )}
            <div className="absolute inset-x-0 bottom-0 p-5 flex items-end justify-between gap-4 bg-gradient-to-t from-black/55 to-transparent text-white pointer-events-none">
              <AnimatePresence mode="wait" initial={false}>
                <m.span key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.35 }} className="flex flex-col">
                  {stage && <span className="text-xs tracking-[0.18em] uppercase text-white/75">{stage}</span>}
                  <span className="text-2xl font-semibold tracking-[-0.02em]">{formatUpdateDate(u.date)}</span>
                </m.span>
              </AnimatePresence>
              {n > 1 && (
                <span className="flex gap-1.5 pb-1.5" aria-hidden="true">
                  {updates.map((up, i) => (
                    <span key={up.id} className={`h-1 rounded-full transition-all duration-500 ${i === active ? 'w-6 bg-white' : 'w-1.5 bg-white/45'}`} />
                  ))}
                </span>
              )}
            </div>
          </div>
        </Container>
      </div>
    </div>
  );
}

// ─── 2b. Carrusel (mobile y sin movimiento) ──────────────────────────

function StoryCarousel({ progress, updates }: { progress: ConstructionProgress; updates: ConstructionUpdate[] }) {
  const items = [...updates].reverse();
  return (
    <ol className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-6 -mx-4 px-4 sm:-mx-6 sm:px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Actualizaciones de obra, la más nueva primero">
      {items.map((up, i) => {
        const stage = stageLabelOf(progress, up.stageId);
        return (
          <li key={up.id} className="snap-start shrink-0 w-[82%] sm:w-[46%] flex flex-col gap-3">
            <div className="relative aspect-[4/3] rounded-[var(--theme-radius)] overflow-hidden bg-[var(--theme-border)]">
              <Image src={up.images[0]} alt={up.title || 'Avance de obra'} fill sizes="(min-width: 640px) 46vw, 82vw" placeholder="blur" blurDataURL={shimmerDataUrl()} className="object-cover" />
              {i === 0 && <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-white text-black">Lo último</span>}
              {up.images.length > 1 && <span className="absolute top-3 right-3 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/55 text-white">{up.images.length} fotos</span>}
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] text-[var(--theme-text-muted)]">{formatUpdateDate(up.date)}{stage ? ` · ${stage}` : ''}</span>
              {up.title && <span className="text-[17px] font-semibold leading-snug">{up.title}</span>}
              {up.body && <span className="text-sm leading-relaxed text-[var(--theme-text-muted)] whitespace-pre-line">{up.body}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── 3. Time-lapse ───────────────────────────────────────────────────

const FRAME_MS = 1400;
/** Fotos por delante de la actual que ya se montan (precarga), no todas de una. */
const PRELOAD_AHEAD = 3;

interface Frame { update: ConstructionUpdate; image: string }

function TimeLapse({ progress, frames, start, onClose }: { progress: ConstructionProgress; frames: Frame[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(start);
  const [playing, setPlaying] = useState(true);
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduce = useReducedMotion();

  // Avanza solo; en la última se detiene (no loopea: el final es el estado
  // de hoy). `running` se deriva para no tener que apagar `playing` a mano.
  const atEnd = i >= frames.length - 1;
  const running = playing && !atEnd;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => setI(x => x + 1), FRAME_MS);
    return () => clearTimeout(t);
  }, [running, i]);

  const step = useCallback((d: number) => { setPlaying(false); setI(x => Math.min(frames.length - 1, Math.max(0, x + d))); }, [frames.length]);
  const toggle = () => {
    if (running) { setPlaying(false); return; }
    if (atEnd) setI(0);
    setPlaying(true);
  };

  useEffect(() => {
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose, step]);

  const f = frames[i];
  if (!f) return null;
  const stage = stageLabelOf(progress, f.update.stageId);
  // Una marca por actualización en la línea de tiempo (no por foto): con
  // muchas fotos, 60 tramos serían ilegibles.
  const marks = frames.reduce<{ id: string; date: string; title: string; first: number; last: number }[]>((acc, fr, k) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.id === fr.update.id) prev.last = k;
    else acc.push({ id: fr.update.id, date: fr.update.date, title: fr.update.title, first: k, last: k });
    return acc;
  }, []);

  return (
    <m.div
      role="dialog"
      aria-modal="true"
      aria-label="Time-lapse de la obra"
      className="fixed inset-0 z-[70] bg-black text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {frames.map((fr, k) => (
        // Se montan la actual, las ya vistas y unas pocas por delante
        // (precarga), y se cruzan por opacidad: sin parpadeo entre fotos.
        k <= i + PRELOAD_AHEAD && (
          <div
            key={`${fr.update.id}-${k}`}
            className="absolute inset-0 transition-opacity ease-linear"
            style={{ opacity: k === i ? 1 : 0, transitionDuration: reduce ? '0ms' : '700ms' }}
            aria-hidden={k !== i}
          >
            <Image src={fr.image} alt={k === i ? (fr.update.title || 'Avance de obra') : ''} fill sizes="100vw" className="object-cover" priority={k === start} />
          </div>
        )
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-black/40 pointer-events-none" />

      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Cerrar time-lapse"
        className="absolute top-4 right-4 sm:top-6 sm:right-6 w-11 h-11 rounded-full bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center hover:bg-white/25 transition-colors"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>

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
          {/* Línea de tiempo: un tramo por actualización, se llena a medida que pasan sus fotos. */}
          <div className="flex-1 flex gap-1.5 min-w-0">
            {marks.map(mk => {
              const count = mk.last - mk.first + 1;
              const isCurrent = i >= mk.first && i <= mk.last;
              // Lo ya recorrido de este tramo, sin contar la foto actual.
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
                        ? { ['--lapse-from' as string]: before, ['--lapse-to' as string]: before + 1 / count, ['--lapse-ms' as string]: `${FRAME_MS}ms` }
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
