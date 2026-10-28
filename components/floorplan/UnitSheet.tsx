'use client';

import { useEffect, useEffectEvent, useRef } from 'react';
import { m as motion, AnimatePresence, animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { useScrollLock } from '@/hooks/useScrollLock';

// Media query del layout de escritorio — la misma que la variante `wide`
// de globals.css. Por encima, la ficha vive en el panel lateral y la hoja
// no se usa.
export const WIDE_QUERY = '(width >= 48rem) and (height >= 35rem)';

const SHEET_SPRING = { type: 'spring', stiffness: 380, damping: 38, mass: 0.9 } as const;

// ── Hoja inferior (mobile) ───────────────────────────────────────
// La ficha de lo elegido en el plano sube desde abajo, sobre el plano
// atenuado. Se cierra arrastrándola hacia abajo desde la manija, tocando
// afuera o con Escape.
export function UnitSheet({ open, onClose, label, contentKey, handleOverContent = false, children }: {
  open: boolean;
  onClose: () => void;
  /** Nombre accesible del diálogo (ej. "Unidad 101"). */
  label: string;
  /** Cambia con la selección: el contenido vuelve arriba al cambiar. */
  contentKey: string;
  /** La manija flota sobre el contenido (que arranca con una foto y trae
   *  su propio botón de cerrar), sin cabecera blanca. Alto fijo, para que
   *  la barra de acciones del contenido quede pegada abajo. */
  handleOverContent?: boolean;
  children: React.ReactNode;
}) {
  const reduced = !!useReducedMotion();
  // Arrastre a mano: el proyecto carga framer-motion con `domAnimation`,
  // que no incluye drag — sumar `domMax` solo para esto no vale el peso.
  const y = useMotionValue(0);
  const dragFrom = useRef<{ y: number; lastY: number; lastT: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useScrollLock(open);

  const onEscape = useEffectEvent((e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); });
  // Al abrir, el foco entra a la hoja; al cerrar, vuelve a lo que se tocó.
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus({ preventScroll: true });
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onEscape);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onDragStart = (e: React.PointerEvent) => {
    if (reduced || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragFrom.current = { y: e.clientY, lastY: e.clientY, lastT: e.timeStamp };
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    // Hacia arriba apenas cede: ya está abierta del todo.
    y.set(dy > 0 ? dy : dy * 0.08);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };
  const onDragEnd = (e: React.PointerEvent) => {
    const d = dragFrom.current;
    if (!d) return;
    dragFrom.current = null;
    const dy = e.clientY - d.y;
    // px/ms del último tramo: un tirón corto y rápido también cierra.
    const v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    if (dy > 110 || (dy > 24 && v > 0.6)) onClose();
    else animate(y, 0, SHEET_SPRING);
  };

  return (
    // Sin portal: la ficha usa las variables del tema del proyecto (color de
    // acento), que viven en un ancestro — colgada del <body> las perdía.
    <AnimatePresence>
      {open && (
        <div key="sheet" className="wide:hidden">
          <motion.div
            aria-hidden="true"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 z-[55] bg-[rgba(12,14,13,0.5)] backdrop-blur-[3px]"
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            style={reduced ? undefined : { y }}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={reduced ? { duration: 0.15 } : SHEET_SPRING}
            className={`fixed inset-x-0 bottom-0 z-[56] flex flex-col rounded-t-[20px] bg-white overflow-hidden outline-none shadow-[0_-18px_60px_rgba(0,0,0,0.28)] ${handleOverContent ? 'h-[92dvh]' : 'max-h-[90dvh]'}`}
          >
            {handleOverContent ? (
              // Zona de arrastre al centro: a los costados de la foto van
              // compartir y cerrar.
              <div
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className="absolute top-0 left-1/2 -translate-x-1/2 z-20 w-40 h-11 flex justify-center pt-2 touch-none cursor-grab active:cursor-grabbing"
              >
                <span aria-hidden="true" className="w-10 h-1 rounded-full bg-white/85 shadow-[0_1px_3px_rgba(0,0,0,0.3)]" />
              </div>
            ) : (
              // Cabecera: se arrastra desde acá (el contenido de abajo
              // scrollea).
              <div
                onPointerDown={onDragStart}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className="relative shrink-0 h-12 flex justify-center pt-2 touch-none cursor-grab active:cursor-grabbing"
              >
                <span aria-hidden="true" className="w-10 h-[5px] rounded-full bg-gray-300" />
                <button
                  type="button"
                  onClick={onClose}
                  onPointerDown={e => e.stopPropagation()}
                  aria-label="Cerrar"
                  className="group absolute right-1.5 top-0 w-11 h-11 flex items-center justify-center"
                >
                  <span className="w-8 h-8 rounded-full bg-gray-100 group-hover:bg-gray-200 text-gray-600 flex items-center justify-center transition-colors">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
                  </span>
                </button>
              </div>
            )}
            <div
              key={contentKey}
              // La foto de portada del panel de escritorio, como tarjeta: con
              // margen y esquinas.
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain [&_.sheet-cover]:mx-4 [&_.sheet-cover]:h-[220px] [&_.sheet-cover]:rounded-[20px] [&_.sheet-cover]:overflow-hidden"
              style={handleOverContent ? undefined : { paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
