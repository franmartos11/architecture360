'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, m, useInView, useReducedMotion } from 'framer-motion';
import { currentStageIndex } from '@/lib/construction-progress';
import type { ConstructionProgress } from '@/types';
import { Pill } from '../ui';

/**
 * Resumen: porcentaje que cuenta hasta su valor al entrar en pantalla,
 * entrega estimada y la tira de etapas (hechas, en curso, pendientes).
 */
export default function Summary({ progress, onLapse }: { progress: ConstructionProgress; onLapse?: () => void }) {
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
                <span data-testid="progress-percent" className="font-[family-name:var(--theme-font-heading)] text-[clamp(72px,9vw,132px)] leading-[0.85] font-medium tracking-[-0.05em] tabular-nums">
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
