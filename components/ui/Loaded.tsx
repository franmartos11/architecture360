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

/**
 * Props de movimiento para el elemento raíz de un contenido que se monta
 * DESPUÉS de un skeleton (`<m.div {...useContentIn()}>`): la misma entrada
 * que `Loaded`, sin envoltorio extra.
 *
 * Existe porque `Loaded` evalúa sus children aunque esté cargando, y las
 * pantallas cuyos datos son null mientras cargan (form, project, tree…)
 * necesitan el early return `if (loading) return <Skeleton/>`. Ahí el
 * contenido nace recién al terminar de cargar, y con `initial`/`animate`
 * en el montaje anima una sola vez — los rerenders no lo repiten. Hay que
 * llamarlo ARRIBA del componente, antes de cualquier return temprano.
 */
export function useContentIn() {
  const reduced = !!useReducedMotion();
  return {
    initial: reduced ? false as const : { opacity: 0, y: CONTENT_IN_Y },
    animate: { opacity: 1, y: 0 },
    transition: reducedOr(reduced, CONTENT_IN),
  };
}
