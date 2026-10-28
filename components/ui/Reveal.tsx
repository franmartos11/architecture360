import type { CSSProperties, ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Segundos — para escalonar bloques hermanos. */
  delay?: number;
  /** Desplazamiento inicial en px. */
  y?: number;
  /** Para anclas de navegación (`#seccion`) — sin esto, quien necesitaba un
   * id terminaba envolviendo el Reveal en un <div id="..."> extra, que
   * rompe el stretch de un grid padre (ver LandingPortfolio.tsx). */
  id?: string;
}

// Hace aparecer su contenido con un fade+slide suave la primera vez que
// entra desde abajo al scrollear. Lo que ya está en pantalla al cargar, o
// que se pasó de largo, aparece sin animación; sin JS se ve todo. La lógica
// vive en lib/reveal-script.ts (corre antes de hidratar) y el estilo en
// globals.css ([data-reveal]) — este componente solo marca el bloque.
//
// suppressHydrationWarning: el script le agrega data-revealed antes de que
// React hidrate.
export default function Reveal({ children, className, delay = 0, y = 24, id }: RevealProps) {
  return (
    <div
      id={id}
      data-reveal=""
      className={className}
      style={{ '--reveal-delay': `${delay}s`, '--reveal-y': `${y}px` } as CSSProperties}
      suppressHydrationWarning
    >
      {children}
    </div>
  );
}
