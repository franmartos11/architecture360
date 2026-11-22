'use client';

import { useState, type ReactNode } from 'react';
import { m, AnimatePresence, useIsPresent, useReducedMotion } from 'framer-motion';
import { EXPAND, reducedOr } from '@/lib/motion';

/**
 * Despliega y pliega su contenido animando la altura (0 ↔ auto): para
 * secciones de acordeón, subítems de navegación, "ver más", filtros
 * avanzados.
 *
 *   <Collapse open={open}>…</Collapse>
 *
 * Mientras se mueve recorta con `overflow: hidden`; ya abierto del todo
 * libera el overflow para que un menú o un anillo de foco adentro no queden
 * cortados. framer-motion (con `domAnimation`) mide el destino `auto`, lo
 * anima en píxeles y al terminar deja `height: auto` — no hace falta medir
 * a mano y el contenido puede crecer después.
 *
 * Cerrado, el contenido se desmonta (`unmountOnExit`, default) una vez que
 * terminó de plegarse. Con `unmountOnExit={false}` queda montado pero
 * `inert` y `aria-hidden` — útil cuando adentro hay campos cuyo estado
 * conviene conservar. Si nace abierto aparece sin animar. Con movimiento
 * reducido, cambia sin animación.
 */
export interface CollapseProps {
  open: boolean;
  /** Desmonta los hijos al cerrar (default). false: los deja montados, inertes. */
  unmountOnExit?: boolean;
  className?: string;
  children: ReactNode;
}

export default function Collapse({ open, unmountOnExit = true, className, children }: CollapseProps) {
  const reduced = !!useReducedMotion();

  if (unmountOnExit) {
    return (
      <AnimatePresence initial={false}>
        {open && (
          <Panel key="collapse" open exitable reduced={reduced} className={className}>
            {children}
          </Panel>
        )}
      </AnimatePresence>
    );
  }

  return (
    <Panel open={open} reduced={reduced} className={className}>
      {children}
    </Panel>
  );
}

// Componente aparte para leer la presencia: cuando AnimatePresence lo está
// sacando, sigue recibiendo las props de cuando estaba abierto, así que
// "está cerrando" se lee de `useIsPresent`, no de `open`.
function Panel({ open, exitable = false, reduced, className, children }: { open: boolean; exitable?: boolean; reduced: boolean; className?: string; children: ReactNode }) {
  const present = useIsPresent();
  const showing = open && present;
  // Abierto y quieto: overflow libre. Arranca en true para el caso sin
  // animación (nace abierto, o movimiento reducido, donde los callbacks no
  // son de fiar y se va directo por `showing`).
  const [settled, setSettled] = useState(true);
  const visible = showing && (reduced || settled);

  return (
    <m.div
      // Montado fijo: nace en su estado, sin animar. Con AnimatePresence el
      // `initial={false}` de arriba ya evita la animación del primer render.
      initial={exitable ? { height: 0 } : false}
      animate={{ height: showing ? 'auto' : 0 }}
      exit={{ height: 0 }}
      transition={reducedOr(reduced, EXPAND)}
      onAnimationStart={() => { if (!reduced) setSettled(false); }}
      onAnimationComplete={() => { if (!reduced) setSettled(true); }}
      aria-hidden={!showing}
      inert={!showing}
      style={{ overflow: visible ? 'visible' : 'hidden' }}
      className={className}
    >
      {children}
    </m.div>
  );
}
