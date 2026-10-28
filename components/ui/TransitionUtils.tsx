'use client';

import Link, { useLinkStatus } from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ComponentProps } from 'react';

// Antes estos helpers envolvían router.push en document.startViewTransition
// a mano. Tres problemas medidos: router.push no espera a que la página
// nueva esté dibujada, así que la transición capturaba la página VIEJA como
// "después" (andaba de casualidad si la navegación tardaba < 250 ms);
// el preventDefault incondicional rompía Cmd/Ctrl+clic y clic del medio
// (abrir en pestaña nueva); y un onClick propio pisaba el de la transición.
//
// Ahora las navegaciones son de Next sin más: con experimental.viewTransition
// React arranca la transición cuando la página nueva ya está lista (ver
// <ViewTransition> en ProjectChrome). Se conservan los nombres para no tocar
// los ~75 lugares que los usan.

type TransitionLinkProps = ComponentProps<typeof Link>;

export function TransitionLink({ children, ...props }: TransitionLinkProps) {
  return (
    <Link {...props}>
      {children}
      <NavPendingSignal />
    </Link>
  );
}

// Mientras la navegación de este link está pendiente, marca el <html> para
// que la barra muestre su línea de "cargando" (ver globals.css,
// html[data-nav-pending]). No renderiza nada.
function NavPendingSignal() {
  const { pending } = useLinkStatus();
  useEffect(() => {
    if (!pending) return;
    const root = document.documentElement;
    root.setAttribute('data-nav-pending', '');
    return () => root.removeAttribute('data-nav-pending');
  }, [pending]);
  return null;
}

/** Igual que useRouter: las navegaciones ya disparan la transición. */
export function useTransitionRouter() {
  return useRouter();
}
