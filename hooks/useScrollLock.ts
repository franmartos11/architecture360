'use client';

import { useEffect } from 'react';

/**
 * Congela el scroll del fondo mientras hay un modal abierto.
 *
 * `overflow: hidden` en el body no alcanza en iOS Safari: ahí el scroll se
 * lo queda igual la página de atrás. Lo que sí funciona es sacar el body del
 * flujo con `position: fixed` y devolverlo después a donde estaba — de ahí
 * que se guarde el scrollY y se restaure al cerrar.
 *
 * Al fijar el body desaparece la barra de scroll y el contenido se corre unos
 * píxeles; se compensa con padding del mismo ancho que la barra (0 en
 * touch, donde la barra flota).
 */
export function useScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;

    const { body } = document;
    const scrollY = window.scrollY;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;

    const previo = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    return () => {
      body.style.position = previo.position;
      body.style.top = previo.top;
      body.style.left = previo.left;
      body.style.right = previo.right;
      body.style.width = previo.width;
      body.style.paddingRight = previo.paddingRight;
      // Sin 'instant' el navegador anima la vuelta y se ve un salto.
      window.scrollTo({ top: scrollY, behavior: 'instant' as ScrollBehavior });
    };
  }, [locked]);
}
