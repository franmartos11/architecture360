'use client';

import { useMemo, useState } from 'react';
import { AnimatePresence, useReducedMotion } from 'framer-motion';
import { formatUpdateDate, visibleUpdates } from '@/lib/construction-progress';
import { lapseFrames, sameAngleComparison, storyWindow } from '@/lib/construction-progress-view';
import type { ConstructionProgress } from '@/types';
import { Container, SectionHeading } from './ui';
import Summary from './construction-progress/Summary';
import SameAngleCompare from './construction-progress/SameAngleCompare';
import StoryScroll from './construction-progress/StoryScroll';
import StoryCarousel from './construction-progress/StoryCarousel';
import TimeLapse from './construction-progress/TimeLapse';

/**
 * Avance de obra. Cada pieza aparece solo si tiene datos:
 * 1. Resumen: porcentaje, entrega estimada y tira de etapas.
 * 2. Mismo ángulo: primera contra última foto desde el lugar más
 *    fotografiado — la prueba del porcentaje.
 * 3. Historia: en pantallas anchas, con scroll y acotada a las últimas
 *    entradas; en mobile (y sin movimiento) un carrusel con todas.
 * 4. Time-lapse: todos los cuadros (fotos y clips) a pantalla completa.
 *
 * Todo sale de `visibleUpdates`: los borradores no llegan a ninguna pieza.
 * Es igual para cualquier tipo de proyecto: las etapas las define el admin.
 */
export default function ConstructionProgressView({ progress }: { progress: ConstructionProgress }) {
  const reduce = useReducedMotion();
  const updates = useMemo(() => visibleUpdates(progress), [progress]);
  const frames = useMemo(() => lapseFrames(updates), [updates]);
  const story = useMemo(() => storyWindow(updates), [updates]);
  const comparison = useMemo(() => sameAngleComparison(progress, updates), [progress, updates]);
  const [lapseAt, setLapseAt] = useState<number | null>(null);
  // Abre el time-lapse en el primer cuadro de una entrada (o desde el principio).
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
        {comparison && <SameAngleCompare comparison={comparison} />}
      </Container>

      {updates.length > 0 && (
        <>
          {!reduce && <StoryScroll progress={progress} updates={story} total={updates.length} onMore={openLapse} onAll={() => openLapse()} />}
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
