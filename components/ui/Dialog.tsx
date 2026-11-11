'use client';

import { createContext, useContext, useEffect, useEffectEvent, useId, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { m, AnimatePresence, useReducedMotion } from 'framer-motion';
import ModalPortal from '@/components/ui/ModalPortal';
import { BACKDROP, DIALOG, DIALOG_OUT, REDUCED_FADE, SHEET_SPRING } from '@/lib/motion';
import { getFocusables, focusQuiet } from '@/lib/focus';

/**
 * El modal del proyecto: uno solo para el panel y el sitio, accesible de
 * fábrica.
 *
 *   <Dialog open={open} onClose={close} title="Invitar a alguien" description="Le llega un mail con el acceso."
 *           footer={<><button className={btnSecondary} onClick={close}>Cancelar</button><button className={btnPrimary}>Invitar</button></>}>
 *     …campos…
 *   </Dialog>
 *
 * Estructura: cabecera (título + bajada + cerrar), cuerpo que scrollea si
 * no entra (`children`, con padding salvo `padded={false}`) y pie fijo
 * (`footer`, alineado a la derecha). `DialogHeader` y `DialogFooter` son
 * las mismas piezas, exportadas para armar un layout propio sin `title`
 * ni `footer` (en ese caso van dentro de `children` y scrollean con él).
 *
 * Qué hace solo: va al <body> por ModalPortal (scroll de fondo congelado,
 * variables del tema copiadas); fondo con BACKDROP y panel con DIALOG /
 * DIALOG_OUT (con movimiento reducido, fundido corto); `role="dialog"`
 * (o `alertdialog`), `aria-modal`, `aria-labelledby` al título y
 * `aria-describedby` a la bajada; al abrir, foco en `initialFocus` o en el
 * primer enfocable (o el panel); Tab/Shift+Tab quedan adentro; Escape y el
 * clic en el fondo cierran (salvo `dismissible={false}`: ahí solo cierran
 * los botones); al cerrar, el foco vuelve a donde estaba.
 *
 * `variant="sheet"`: en pantallas angostas sube desde abajo como una hoja
 * (SHEET_SPRING), sin arrastre — eso es cosa de UnitSheet; en escritorio es
 * el modal centrado.
 *
 * No se marca `inert` el resto del documento: ConfirmProvider y los toasts
 * viven en el árbol de React, no en portales, y quedarían inertes también
 * (un "¿Borrar?" lanzado desde un Dialog no se podría tocar). El foco
 * atrapado más `aria-modal` cubren lo mismo para teclado y lectores.
 *
 * Capa: z-[200], debajo de ConfirmProvider (300) para que una confirmación
 * pueda abrirse encima.
 */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Título de la cabecera; también el nombre accesible del diálogo. */
  title?: ReactNode;
  /** Bajada bajo el título (y `aria-describedby`). */
  description?: ReactNode;
  /** Botones del pie, fuera del área que scrollea. */
  footer?: ReactNode;
  /** sm 400 px · md 520 px · lg 720 px · xl 1120 px de ancho máximo. */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** `sheet`: hoja desde abajo en pantallas angostas. */
  variant?: 'center' | 'sheet';
  /** `alertdialog` para confirmaciones que exigen una respuesta. */
  role?: 'dialog' | 'alertdialog';
  /** false: ni Escape ni el fondo cierran (hay que elegir un botón). */
  dismissible?: boolean;
  /** Id del título cuando lo renderiza el contenido en vez de `title`. */
  labelledBy?: string;
  /** Qué enfocar al abrir, en vez del primer enfocable. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Sin padding en el cuerpo (listas de borde a borde, imágenes). */
  padded?: boolean;
  /** Clases extra del panel. */
  className?: string;
  /** Capa z-[300] en vez de 200: para un Dialog que se abre encima de otro (ConfirmProvider). */
  elevated?: boolean;
  children: ReactNode;
}

const SIZE = { sm: 'sm:max-w-[400px]', md: 'sm:max-w-[520px]', lg: 'sm:max-w-[720px]', xl: 'sm:max-w-[1120px]' } as const;

// Misma media query que la variante `wide` de globals.css y que UnitSheet.
// Sin matchMedia (jsdom, entornos raros) se asume escritorio.
const WIDE_QUERY = '(width >= 48rem) and (height >= 35rem)';
function subscribeWide(cb: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mql = window.matchMedia(WIDE_QUERY);
  mql.addEventListener('change', cb);
  return () => mql.removeEventListener('change', cb);
}
function useIsNarrow() {
  return useSyncExternalStore(
    subscribeWide,
    () => typeof window.matchMedia === 'function' && !window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

// Pila de diálogos abiertos: con uno encima de otro (un confirm dentro de un
// modal), solo el de arriba atiende Escape y Tab; si no, un Escape cerraría
// los dos y el Tab del de abajo le robaría el foco al de arriba.
const dialogStack: HTMLElement[] = [];

interface DialogContextValue { titleId: string; descriptionId: string; onClose: () => void }
const DialogContext = createContext<DialogContextValue | null>(null);

export default function Dialog({
  open, onClose, title, description, footer, size = 'md', variant = 'center', role = 'dialog',
  dismissible = true, labelledBy, initialFocus, padded = true, className = '', elevated = false, children,
}: DialogProps) {
  const reduced = !!useReducedMotion();
  const isNarrow = useIsNarrow();
  const asSheet = variant === 'sheet' && isNarrow;
  const panelRef = useRef<HTMLDivElement>(null);
  const z = elevated ? 'z-[300]' : 'z-[200]';
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useEffectEvent(() => { if (dismissible) onClose(); });
  const focusInitial = useEffectEvent((panel: HTMLElement) => {
    focusQuiet(initialFocus?.current ?? getFocusables(panel)[0] ?? panel);
  });

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const prev = document.activeElement as HTMLElement | null;
    focusInitial(panel);
    dialogStack.push(panel);

    const onKey = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== panel) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
        return;
      }
      if (e.key !== 'Tab') return;
      // Tab atrapado: del último vuelve al primero y viceversa. Si el foco
      // se escapó del panel (clic en el fondo), vuelve adentro.
      const items = getFocusables(panel);
      if (items.length === 0) {
        e.preventDefault();
        focusQuiet(panel);
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        focusQuiet(e.shiftKey ? last : first);
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        focusQuiet(last);
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        focusQuiet(first);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const at = dialogStack.indexOf(panel);
      if (at !== -1) dialogStack.splice(at, 1);
      if (prev && prev !== document.body && prev.isConnected) focusQuiet(prev);
    };
  }, [open]);

  const panelMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: REDUCED_FADE }, transition: REDUCED_FADE }
    : asSheet
      ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%', transition: SHEET_SPRING }, transition: SHEET_SPRING }
      : { initial: { opacity: 0, scale: 0.96, y: 8 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.98, y: 4, transition: DIALOG_OUT }, transition: DIALOG };

  const shape = asSheet
    ? 'w-full max-h-[94dvh] rounded-t-[20px] shadow-[0_-12px_40px_rgba(17,24,39,0.2)]'
    : `w-full ${SIZE[size]} max-h-[90dvh] rounded-2xl shadow-[0_24px_60px_-12px_rgba(17,24,39,0.35),0_2px_8px_rgba(17,24,39,0.08)]`;

  return (
    <ModalPortal open={open}>
      <AnimatePresence>
        {open && (
          <DialogContext.Provider value={{ titleId, descriptionId, onClose }}>
            <m.div
              key="backdrop"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={BACKDROP}
              onClick={() => { if (dismissible) onClose(); }}
              data-dialog-backdrop=""
              className={`fixed inset-0 ${z} bg-[rgba(17,24,39,0.55)] backdrop-blur-[3px]`}
            />
            <div
              key="layer"
              className={`fixed inset-0 ${z} flex pointer-events-none ${asSheet ? 'items-end' : 'items-center justify-center p-4'}`}
            >
              <m.div
                ref={panelRef}
                role={role}
                aria-modal="true"
                aria-labelledby={labelledBy ?? titleId}
                aria-describedby={description ? descriptionId : undefined}
                tabIndex={-1}
                {...panelMotion}
                className={`pointer-events-auto flex flex-col overflow-hidden bg-white text-gray-900 outline-none ${shape} ${className}`}
                style={asSheet ? { paddingBottom: 'env(safe-area-inset-bottom)' } : undefined}
              >
                {title != null && <DialogHeader title={title} description={description} />}
                <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${padded ? 'px-6 py-5' : ''}`}>
                  {children}
                </div>
                {footer != null && <DialogFooter>{footer}</DialogFooter>}
              </m.div>
            </div>
          </DialogContext.Provider>
        )}
      </AnimatePresence>
    </ModalPortal>
  );
}

/**
 * Cabecera: título (toma el id del `aria-labelledby` del Dialog), bajada
 * opcional y botón de cerrar a la derecha (`closeButton={false}` lo saca,
 * p. ej. en un `alertdialog`).
 */
export function DialogHeader({ title, description, closeButton = true, className = '' }: {
  title: ReactNode;
  description?: ReactNode;
  closeButton?: boolean;
  className?: string;
}) {
  const ctx = useContext(DialogContext);
  return (
    <div className={`shrink-0 flex items-start gap-3 px-6 pt-5 pb-4 border-b border-gray-200 ${className}`}>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <h2 id={ctx?.titleId} className="m-0 text-[17px] leading-snug font-semibold text-gray-900">{title}</h2>
        {description && <p id={ctx?.descriptionId} className="m-0 text-[13px] leading-relaxed text-gray-600">{description}</p>}
      </div>
      {closeButton && ctx && (
        <button
          type="button"
          onClick={ctx.onClose}
          aria-label="Cerrar"
          className="-mr-2 -mt-1.5 w-10 h-10 shrink-0 rounded-[10px] flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  );
}

/** Pie: botones alineados a la derecha sobre una línea, fuera del scroll. */
export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`shrink-0 flex items-center justify-end gap-2 flex-wrap px-6 py-4 border-t border-gray-200 bg-gray-50 ${className}`}>
      {children}
    </div>
  );
}
