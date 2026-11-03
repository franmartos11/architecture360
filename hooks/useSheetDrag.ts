'use client';

import { useRef } from 'react';
import { animate, useMotionValue, useReducedMotion } from 'framer-motion';
import { SHEET_SPRING } from '@/lib/motion';

// Arrastrar una hoja hacia abajo para cerrarla — a mano, porque el proyecto
// carga framer-motion con `domAnimation`, que no incluye drag (sumar
// `domMax` solo para esto no vale el peso). Los handlers van en la zona de
// arrastre (manija/cabecera), no en el contenido que scrollea.
export function useSheetDrag(onClose: () => void) {
  const reduced = !!useReducedMotion();
  const y = useMotionValue(0);
  const from = useRef<{ y: number; lastY: number; lastT: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (reduced || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    from.current = { y: e.clientY, lastY: e.clientY, lastT: e.timeStamp };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = from.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    // Hacia arriba apenas cede: ya está abierta del todo.
    y.set(dy > 0 ? dy : dy * 0.08);
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = from.current;
    if (!d) return;
    from.current = null;
    const dy = e.clientY - d.y;
    // px/ms del último tramo: un tirón corto y rápido también cierra.
    const v = (e.clientY - d.lastY) / Math.max(1, e.timeStamp - d.lastT);
    if (dy > 110 || (dy > 24 && v > 0.6)) onClose();
    else animate(y, 0, SHEET_SPRING);
  };

  return {
    reduced,
    /** Para `style` de la hoja (si no hay movimiento reducido). */
    y,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    /** Props de entrada/salida de la hoja. */
    sheetMotion: reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } }
      : { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' }, transition: SHEET_SPRING },
  };
}
