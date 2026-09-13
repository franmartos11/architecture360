'use client';

import { createContext, useContext, type ReactNode } from 'react';

export type AccordionStatus = 'complete' | 'partial' | 'empty';

const STATUS_DOT: Record<AccordionStatus, string> = {
  complete: 'bg-brand-500',
  partial: 'bg-amber-400',
  empty: 'bg-gray-200',
};

interface AccordionContextValue {
  value: string;
  onChange: (value: string) => void;
  collapsible: boolean;
}

const AccordionContext = createContext<AccordionContextValue | null>(null);

// Acordeón simple, una sola sección abierta a la vez — controlado por
// `value`/`onChange` (el mismo patrón que un tab-switcher, solo cambia la
// presentación visual). Por default no colapsa al reclickear su propia
// cabecera (igual que un tab-switcher); pasar `collapsible` para permitir
// cerrar la sección abierta reclickeándola, útil cuando el contenedor no
// necesita tener siempre algo abierto (ej. una tarjeta de datos plegable).
export function Accordion({ value, onChange, collapsible = false, children }: { value: string; onChange: (value: string) => void; collapsible?: boolean; children: ReactNode }) {
  return (
    <AccordionContext.Provider value={{ value, onChange, collapsible }}>
      <div className="flex flex-col gap-3">{children}</div>
    </AccordionContext.Provider>
  );
}

export function AccordionItem({
  value, label, status, badge, children,
}: {
  value: string;
  label: string;
  /** Punto de estado — omitilo si la sección no tiene un criterio de "completo" claro. */
  status?: AccordionStatus;
  /** Badge chico a la derecha del label (ej. "3/4", conteo de ambientes). Omitilo si no aplica. */
  badge?: string;
  children: ReactNode;
}) {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('AccordionItem debe usarse dentro de <Accordion>');
  const open = ctx.value === value;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => ctx.onChange(open && ctx.collapsible ? '' : value)}
        aria-expanded={open}
        className="w-full h-12 px-4 flex items-center gap-3 text-left hover:bg-gray-50/60 transition-colors"
      >
        {status && <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[status]}`} />}
        <span className="flex-1 text-sm font-medium text-gray-900">{label}</span>
        {badge && (
          <span className="h-[19px] min-w-[19px] px-1.5 rounded-md flex items-center justify-center text-[10px] font-semibold bg-gray-100 text-gray-600 shrink-0">
            {badge}
          </span>
        )}
        <span className={`text-gray-400 text-xs transition-transform shrink-0 ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-3.5">
          {children}
        </div>
      )}
    </div>
  );
}
