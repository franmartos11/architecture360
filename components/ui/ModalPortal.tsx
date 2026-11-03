'use client';

import { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useScrollLock } from '@/hooks/useScrollLock';

interface ModalPortalProps {
  /** Si el modal está abierto: engancha el lock de scroll. */
  open: boolean;
  children: React.ReactNode;
}

/**
 * Manda el modal al final del <body> y congela el scroll de atrás.
 *
 * El portal no es cosmético: un `position: fixed` deja de referirse al
 * viewport y pasa a referirse al ancestro si alguno tiene `transform`,
 * `filter` o `will-change`. Como estos modales viven dentro de árboles con
 * framer-motion y transiciones de hover, cualquier ancestro puede ganar un
 * transform y dejar el overlay corrido o recortado. Colgando del body no hay
 * ancestro que pueda hacerlo.
 *
 * Monta recién en el cliente: en el server no hay document y el markup del
 * modal no tiene por qué estar en el HTML inicial.
 *
 * Colgado del body pierde las variables del tema del proyecto (color de
 * acento, tipografías), que viven en el contenedor `[data-project-theme]`:
 * se copian a un envoltorio `display: contents` que no altera el layout.
 */
const subscribeNoop = () => () => {};

export default function ModalPortal({ open, children }: ModalPortalProps) {
  // true recién en el cliente (en el server, y al hidratar, false).
  const montado = useSyncExternalStore(subscribeNoop, () => true, () => false);
  useScrollLock(open);

  if (!montado) return null;
  return createPortal(
    <div
      className="contents"
      ref={el => {
        const theme = document.querySelector<HTMLElement>('[data-project-theme]');
        if (el && theme) el.style.cssText = `${theme.style.cssText};display:contents`;
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
