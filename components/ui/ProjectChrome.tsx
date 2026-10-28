'use client';

import { ViewTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import type { ProjectNavInfo } from '@/lib/project-nav';
import { ProjectNavProvider } from '@/lib/project-nav-context';

// El tour de amenities se embebe en un <iframe> con ?embed=true (ver
// components/unit/tabs/AmenitiesTab.tsx) — CommonAreasTour ya oculta su
// propio chrome en ese modo, pero el Navbar global no tiene forma de
// enterarse: los layouts de Next no reciben searchParams, sólo las
// páginas. Por eso el chrome del proyecto entero (Navbar + el padding que
// le hace lugar) vive en un Client Component que sí puede leer el query
// param del propio navegador y desaparecer por completo dentro del iframe.
//
// La barra es la misma en todas las rutas del proyecto: web, Explorar 3D
// y ficha de unidad.
export default function ProjectChrome({ children, ...info }: ProjectNavInfo & { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  if (searchParams.get('embed') === 'true') {
    return <>{children}</>;
  }

  return (
    <ProjectNavProvider value={info}>
      <Navbar info={info} />
      {/* Cada página es una entrada distinta (key = ruta): al navegar, la
          nueva entra encima de la vieja con .page-swap (ver globals.css).
          Las demás transiciones de la página no la animan. El fondo del
          tema hace opaca la captura de cada página: sin él, la vieja se
          veía por las zonas que la nueva no pinta. */}
      <ViewTransition key={pathname} enter="page-swap" exit="page-swap" default="none">
        <div className="pt-16 bg-[var(--theme-bg)]">{children}</div>
      </ViewTransition>
    </ProjectNavProvider>
  );
}
