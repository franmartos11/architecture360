'use client';

import { TransitionLink } from '@/components/ui/TransitionUtils';
import { m as motion } from 'framer-motion';

export interface Crumb {
  /** Texto a mostrar — SIEMPRE un nombre real (proyecto, edificio, unidad),
   *  nunca un slug o código de la URL. */
  label: string;
  /** Link. Sin href = crumb actual (no clickable). */
  href?: string;
}

// Migas de pan genéricas: el que la renderiza arma la lista con datos
// reales. Antes esto parseaba el pathname y mostraba el SLUG en mayúsculas
// con un prefijo de tipo ("Casa" + "casa" = "Casa CASA"), que quedaba
// redundante o directamente ilegible. Ahora el componente no adivina nada.
export default function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  // Saca vacíos y colapsa crumbs consecutivos con el mismo texto — pasa
  // cuando dos niveles de la jerarquía son la misma cosa (ej. una "casa":
  // el edificio ES el proyecto, así que "Proyecto > Proyecto" → "Proyecto").
  const clean = crumbs
    .filter(c => c.label.trim().length > 0)
    .filter((c, i, arr) => i === 0 || c.label.trim().toLowerCase() !== arr[i - 1].label.trim().toLowerCase());
  if (clean.length <= 1) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/90 backdrop-blur-md rounded-2xl shadow-sm border border-gray-200/50 max-w-[calc(100vw-2.5rem)] overflow-x-auto"
    >
      {clean.map((crumb, index) => {
        const isLast = index === clean.length - 1;
        return (
          <div key={`${crumb.label}-${index}`} className="flex items-center">
            {index > 0 && (
              <svg className="w-4 h-4 mx-2 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            )}
            {isLast || !crumb.href ? (
              <span className="text-sm font-semibold text-gray-900 tracking-wide whitespace-nowrap">{crumb.label}</span>
            ) : (
              <TransitionLink
                href={crumb.href}
                className="text-sm font-medium text-gray-500 hover:text-brand-500 transition-colors tracking-wide whitespace-nowrap"
              >
                {crumb.label}
              </TransitionLink>
            )}
          </div>
        );
      })}
    </motion.div>
  );
}
