'use client';

import { useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';
import { useProjectBasePath } from '@/lib/project-base-path-context';
import { isExploreProjectPath, isImmersiveProjectPath, type ProjectNavInfo } from '@/lib/project-nav';
import { ProjectNavProvider, SceneCrumbTargetProvider } from '@/lib/project-nav-context';

// El tour de amenities se embebe en un <iframe> con ?embed=true (ver
// components/unit/tabs/AmenitiesTab.tsx) — CommonAreasTour ya oculta su
// propio chrome en ese modo, pero el Navbar global no tiene forma de
// enterarse: los layouts de Next no reciben searchParams, sólo las
// páginas. Por eso el chrome del proyecto entero (Navbar + el padding que
// le hace lugar) vive en un Client Component que sí puede leer el query
// param del propio navegador y desaparecer por completo dentro del iframe.
//
// En la ficha de unidad (vista inmersiva) la barra global no se muestra:
// repetía la barra propia de la vista, que lee useProjectNav() para usar
// todo el alto y mostrar el botón "Menú" (ProjectWebLink). La fachada, las
// plantas y los recorridos sí usan esta barra, con su fila de contexto.
export default function ProjectChrome({ children, ...info }: ProjectNavInfo & { children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const basePath = useProjectBasePath();
  // El hueco de la fila de contexto donde cada visor de Explorar 3D pinta
  // su último tramo de migas (ver SceneCrumb). Lo setea el ref de la barra.
  const [crumbTarget, setCrumbTarget] = useState<HTMLElement | null>(null);
  if (searchParams.get('embed') === 'true') {
    return <>{children}</>;
  }

  const immersive = isImmersiveProjectPath(pathname, basePath);
  const exploreRoute = isExploreProjectPath(pathname, basePath);

  // --project-nav-h: alto de la barra, para el padding de acá y para las
  // vistas que se miden contra el viewport (fachada, plantas, recorrido).
  // En Explorar 3D, desde 768px, la barra suma la fila de contexto (3rem).
  return (
    <ProjectNavProvider value={{ ...info, immersive, exploreRoute }}>
      <SceneCrumbTargetProvider value={exploreRoute ? crumbTarget : null}>
        {!immersive && <Navbar info={info} contextRow={exploreRoute} crumbRef={setCrumbTarget} />}
        <div
          className={`[--project-nav-h:4rem] ${exploreRoute ? 'md:[--project-nav-h:7rem]' : ''} ${
            immersive ? '' : 'pt-[var(--project-nav-h)]'
          }`}
        >
          {children}
        </div>
      </SceneCrumbTargetProvider>
    </ProjectNavProvider>
  );
}
