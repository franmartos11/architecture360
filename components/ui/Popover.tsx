'use client';

import { useEffect, useEffectEvent, useRef, type ReactNode } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { POPOVER, POPOVER_OUT, REDUCED_FADE } from '@/lib/motion';
import { getFocusables, focusQuiet } from '@/lib/focus';

/**
 * Menú o popover flotante anclado al botón que lo abre.
 *
 * Uso: va dentro de un contenedor `relative` junto al disparador, que es
 * quien maneja el estado (`aria-expanded` y `aria-haspopup` van en el
 * botón, no acá):
 *
 *   <div className="relative">
 *     <button onClick={() => setOpen(o => !o)} aria-expanded={open} aria-haspopup="menu">⋯</button>
 *     <Popover open={open} onClose={() => setOpen(false)} role="menu" align="end">
 *       <MenuItem onClick={edit}>Editar</MenuItem>
 *       <MenuItem danger onClick={remove}>Borrar</MenuItem>
 *     </Popover>
 *   </div>
 *
 * Qué hace solo: entra con escala + opacidad desde el lado de origen y se
 * va más rápido (POPOVER / POPOVER_OUT; con movimiento reducido, solo un
 * fundido corto); Escape y clic/tap fuera del contenedor cierran; al abrir
 * el foco pasa al primer enfocable (o al panel) y al cerrar vuelve a donde
 * estaba, salvo que la persona ya haya puesto el foco en otro lado (clic en
 * un campo, Tab afuera); ↑/↓/Home/End recorren los ítems. Cerrado no
 * renderiza nada.
 *
 * Sin portal, a propósito: los menús usan las variables del tema del
 * proyecto, que viven en un ancestro (ver el comentario de UnitSheet). El
 * contenedor tiene que estar por encima de lo que lo rodea (`z-50` en el
 * panel; subí el z del contenedor si una tarjeta vecina lo tapa).
 *
 * Escape se escucha en fase de captura y frena la propagación: un menú
 * abierto dentro de un Dialog se cierra solo él, no el modal.
 */
export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** De qué lado del disparador sale. */
  side?: 'bottom' | 'top';
  /** A qué borde del disparador se alinea. */
  align?: 'start' | 'end';
  /** `menu` para listas de acciones (los hijos son `MenuItem`); `dialog`
   *  para un panel con campos; sin rol para contenido suelto. */
  role?: 'menu' | 'dialog' | 'listbox';
  /** Nombre accesible cuando hay rol (ej. "Acciones del post"). */
  ariaLabel?: string;
  /** Se suma al estilo base (ancho, padding). Por default `min-w-[160px] py-1`. */
  className?: string;
  children: ReactNode;
}

const ORIGIN: Record<'bottom' | 'top', Record<'start' | 'end', string>> = {
  bottom: { start: 'top left', end: 'top right' },
  top: { start: 'bottom left', end: 'bottom right' },
};

export default function Popover({ open, onClose, side = 'bottom', align = 'end', role, ariaLabel, className = '', children }: PopoverProps) {
  const reduced = !!useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const close = useEffectEvent(() => onClose());

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;

    // A dónde vuelve el foco: lo que estaba enfocado al abrir (normalmente
    // el disparador; en Safari los botones no toman foco al clic y queda
    // el body — entonces no hay a dónde volver y no se toca nada).
    const prev = document.activeElement as HTMLElement | null;
    focusQuiet(getFocusables(panel)[0] ?? panel);

    // "Afuera" es fuera del contenedor `relative`, que incluye al botón:
    // así el clic en el disparador no cierra y vuelve a abrir en el mismo
    // gesto (eso lo decide el botón con su toggle).
    const container = panel.parentElement ?? panel;
    const onPointer = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
        return;
      }
      if (!panel.contains(document.activeElement)) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        const items = getFocusables(panel);
        if (items.length === 0) return;
        e.preventDefault();
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'Home' ? 0
          : e.key === 'End' ? items.length - 1
          : e.key === 'ArrowDown' ? (i + 1) % items.length
          : (i - 1 + items.length) % items.length;
        focusQuiet(items[next]);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      // Solo si el foco sigue en el menú (o se perdió): si la persona ya
      // hizo clic en un campo de afuera, no se lo robamos.
      const active = document.activeElement;
      const lost = !active || active === document.body || panel.contains(active);
      if (lost && prev && prev !== document.body && prev.isConnected) focusQuiet(prev);
    };
  }, [open]);

  const dy = side === 'bottom' ? -4 : 4;
  const place = `${side === 'bottom' ? 'top-full mt-1' : 'bottom-full mb-1'} ${align === 'end' ? 'right-0' : 'left-0'}`;

  return (
    <AnimatePresence>
      {open && (
        <m.div
          ref={ref}
          role={role}
          aria-label={ariaLabel}
          tabIndex={-1}
          initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: dy }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={reduced ? { opacity: 0, transition: REDUCED_FADE } : { opacity: 0, scale: 0.96, y: dy, transition: POPOVER_OUT }}
          transition={reduced ? REDUCED_FADE : POPOVER}
          style={{ transformOrigin: ORIGIN[side][align] }}
          className={`absolute z-50 ${place} min-w-[160px] py-1 rounded-xl border border-gray-200 bg-white shadow-[0_8px_24px_-8px_rgba(17,24,39,0.25),0_2px_6px_rgba(17,24,39,0.08)] outline-none text-gray-900 ${className}`}
        >
          {children}
        </m.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Fila de un menú de acciones: botón de ancho completo, texto a la
 * izquierda, `role="menuitem"`. `danger` lo pinta de rojo (borrar,
 * descartar). `icon` va a la izquierda del texto, 16 px.
 */
export function MenuItem({ children, onClick, danger = false, disabled = false, icon, className = '' }: {
  children: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 text-left px-3.5 py-2 min-h-[40px] text-sm transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:bg-gray-100 ${
        danger ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50' : 'text-gray-800 hover:bg-gray-100'
      } ${className}`}
    >
      {icon && <span aria-hidden="true" className="shrink-0 w-4 h-4 flex items-center justify-center [&>svg]:w-4 [&>svg]:h-4">{icon}</span>}
      <span className="flex-1 min-w-0 truncate">{children}</span>
    </button>
  );
}
