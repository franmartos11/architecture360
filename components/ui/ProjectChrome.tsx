'use client';

import { useSearchParams } from 'next/navigation';
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
  if (searchParams.get('embed') === 'true') {
    return <>{children}</>;
  }

  return (
    <ProjectNavProvider value={info}>
      <Navbar info={info} />
      <div className="pt-16">{children}</div>
    </ProjectNavProvider>
  );
}
