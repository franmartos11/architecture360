'use client';

import { useEffect, useState } from 'react';
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
 */
export default function ModalPortal({ open, children }: ModalPortalProps) {
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  useScrollLock(open);

  if (!montado) return null;
  return createPortal(children, document.body);
}
