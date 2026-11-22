'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, m, useMotionValueEvent, useScroll } from 'framer-motion';
import { formatUpdateDate, stageLabelOf } from '@/lib/construction-progress';
import { updateIdFromHash } from '@/lib/construction-progress-view';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { Container } from '../ui';
import UpdateCover from './UpdateCover';

/** "Excavación · Texto…" — la etapa y el texto, lo que haya. */
function detailLine(progress: ConstructionProgress, u: ConstructionUpdate): string {
  return [stageLabelOf(progress, u.stageId), u.body].filter(Boolean).join(' · ');
}

/**
 * Historia con scroll (pantallas anchas): la foto queda fija y, al
 * scrollear, va pasando de una entrada a la siguiente con un fundido; a la
 * izquierda se marca la que se está viendo.
 *
 * Recibe ya la ventana acotada (las últimas STORY_MAX): cada entrada ocupa
 * 70vh de scroll y con 30 serían 21 pantallas. `total` es cuántas hay en
 * realidad; si son más, abajo de la lista va "Ver las N entradas", que
 * abre el time-lapse desde el principio.
 */
export default function StoryScroll({ progress, updates, total, onMore, onAll }: {
  progress: ConstructionProgress;
  updates: ConstructionUpdate[];
  total: number;
  /** Abre el time-lapse en las fotos de una entrada. */
  onMore: (updateId: string) => void;
  /** Abre el time-lapse desde el principio. */
  onAll: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const n = updates.length;
  const [active, setActive] = useState(0);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ['start start', 'end end'] });
  useMotionValueEvent(scrollYProgress, 'change', v => setActive(Math.min(n - 1, Math.max(0, Math.floor(v * n)))));

  // Click en una entrada: scrollea hasta el tramo que la muestra.
  const goTo = useCallback((i: number, behavior: ScrollBehavior = 'smooth') => {
    const el = trackRef.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + span * ((i + 0.5) / n), behavior });
  }, [n]);

  // Enlace directo (#avance-<id>): el ancla real está en el carrusel, que en
  // pantallas anchas está oculto, así que el navegador no tiene adónde ir —
  // la posición la pone la historia. Una entrada más vieja que la ventana
  // no tiene tramo propio: queda donde el navegador la deje.
  useEffect(() => {
    const jump = (behavior: ScrollBehavior) => {
      const id = updateIdFromHash(window.location.hash);
      const i = id ? updates.findIndex(u => u.id === id) : -1;
      // Un cuadro después: que el layout (fuentes, alto del hero) ya esté.
      if (i >= 0) requestAnimationFrame(() => goTo(i, behavior));
    };
    jump('auto');
    const onHash = () => jump('smooth');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [updates, goTo]);

  const u = updates[Math.min(active, n - 1)];
  const stage = stageLabelOf(progress, u.stageId);

  return (
    <div ref={trackRef} className="relative hidden lg:block mt-16" style={{ height: `${n * 70 + 30}vh` }}>
      <div className="sticky top-16 h-[calc(100svh-4rem)] flex items-center">
        <Container className="w-full grid grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-12 items-center">
          <div className="flex flex-col min-h-0 max-h-[calc(100svh-9rem)]">
            {/* Con muchas entradas la lista se scrollea sola dentro de la columna. */}
            <ol className="flex flex-col min-h-0 overflow-y-auto [scrollbar-width:thin]">
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
            {total > n && (
              <button
                type="button"
                onClick={onAll}
                className="shrink-0 py-3.5 border-t border-[var(--theme-border)] w-full text-left text-[15px] font-semibold underline underline-offset-4 decoration-[var(--theme-border)] hover:decoration-[var(--theme-text)] transition-colors"
              >
                Ver las {total} entradas
              </button>
            )}
          </div>

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
                <UpdateCover update={u} sizes="60vw" />
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
