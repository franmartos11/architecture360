'use client';

import { useState, type ReactNode } from 'react';
import { m, useReducedMotion } from 'framer-motion';
import { CONTENT_IN, CONTENT_IN_Y, reducedOr } from '@/lib/motion';

/**
 * Reemplaza un skeleton por el contenido real cuando termina de cargar:
 *
 *   <Loaded loading={!data} skeleton={<PageSkeleton><SkeletonTable rows={6} /></PageSkeleton>}>
 *     …la pantalla…
 *   </Loaded>
 *
 * Mientras `loading` muestra `skeleton`; cuando pasa a false, el skeleton
 * se va en el acto y el contenido entra en su lugar con CONTENT_IN (sube
 * `CONTENT_IN_Y` px mientras aparece) — una sola vez: los rerenders
 * posteriores no lo vuelven a animar, y si ya nace cargado (dato en caché)
 * no anima nada. Sin `mode="wait"`: una espera entre uno y otro dejaría la
 * pantalla vacía un instante. Con movimiento reducido, cambia sin animar.
 *
 * El contenido va envuelto en un `div` (necesario para moverlo); `className`
 * es para ese envoltorio, p. ej. `flex flex-col gap-6`.
 */
export interface LoadedProps {
  loading: boolean;
  skeleton: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function Loaded({ loading, skeleton, className, children }: LoadedProps) {
  const reduced = !!useReducedMotion();
  // Si el primer render ya venía cargado no hay "llegada" que mostrar.
  const [animateIn] = useState(() => loading);

  if (loading) return <>{skeleton}</>;

  return (
    <m.div
      initial={animateIn && !reduced ? { opacity: 0, y: CONTENT_IN_Y } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={reducedOr(reduced, CONTENT_IN)}
      className={className}
    >
      {children}
    </m.div>
  );
}
