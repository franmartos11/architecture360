'use client';

import type { ReactNode } from 'react';
import { SlidingIndicator, useSlidingIndicator } from './SlidingIndicator';

/**
 * Segmented del diseño (7 días / 30 días / Todo, Todos / Nuevos…): la
 * pastilla blanca se desliza a la opción elegida, como el selector del
 * sitio público (components/ui/Segmented.tsx). No reusa ese componente
 * porque el look del panel es otro (fondo #EAE7E0, ancho según el texto,
 * radio 10, radiogroup).
 *
 * Si las opciones no entran en un renglón, el contenedor envuelve
 * (`flex-wrap`) y la pastilla sigue a la opción también entre renglones:
 * se mide x/y/ancho/alto, no solo x.
 */
export default function SegmentedTabs<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  // Re-mide también si cambia la lista (un filtro que aparece, etiquetas con contadores).
  const { ref, box } = useSlidingIndicator<HTMLDivElement>(value, options.map(o => o.value).join('|'));

  return (
    <div ref={ref} data-indicator-root="" role="radiogroup" aria-label={label} className="relative isolate inline-flex p-[3px] rounded-[10px] bg-[#EAE7E0] flex-wrap">
      <SlidingIndicator box={box} className="rounded-lg bg-white shadow-[0_1px_2px_rgba(23,25,26,0.06)]" />
      {options.map(o => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} data-indicator={o.value} onClick={() => onChange(o.value)}
            // Hasta medir (el HTML del server, antes de hidratar) el activo
            // pinta su propio fondo; después lo pone la pastilla.
            className={`min-h-[36px] px-3 rounded-lg text-[13px] transition-[color,transform] duration-200 active:scale-[0.97] ${
              on ? `font-semibold text-gray-900 ${box ? '' : 'bg-white shadow-[0_1px_2px_rgba(23,25,26,0.06)]'}` : 'text-gray-600 hover:text-gray-900'
            }`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
