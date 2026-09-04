'use client';

import { m as motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  /** Para anclas de navegación (`#seccion`) — sin esto, quien necesitaba un
   * id terminaba envolviendo el Reveal en un <div id="..."> extra, que
   * rompe el stretch de un grid padre (ver LandingPortfolio.tsx). */
  id?: string;
}

// Hace aparecer su contenido con un fade+slide suave la primera vez que
// entra en el viewport al scrollear (no se repite al salir/volver a entrar).
export default function Reveal({ children, className, delay = 0, y = 24, id }: RevealProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      id={id}
      initial={reduceMotion ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.6, delay, ease: [0.2, 0.8, 0.2, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
