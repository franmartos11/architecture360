'use client';

import { useSearchParams } from 'next/navigation';
import Navbar from '@/components/ui/Navbar';

interface ProjectChromeProps {
  projectName: string;
  showCalculator: boolean;
  hasTour: boolean;
  singleUnit?: { buildingId: string; unitId: string; label: string };
  unitsLabel: string;
  children: React.ReactNode;
}

// El tour de amenities se embebe en un <iframe> con ?embed=true (ver
// components/unit/tabs/AmenitiesTab.tsx) — CommonAreasTour ya oculta su
// propio chrome en ese modo, pero el Navbar global no tiene forma de
// enterarse: los layouts de Next no reciben searchParams, sólo las
// páginas. Por eso el chrome del proyecto entero (Navbar + el padding que
// le hace lugar) vive en un Client Component que sí puede leer el query
// param del propio navegador y desaparecer por completo dentro del iframe.
export default function ProjectChrome({
  projectName, showCalculator, hasTour, singleUnit, unitsLabel, children,
}: ProjectChromeProps) {
  const searchParams = useSearchParams();
  if (searchParams.get('embed') === 'true') {
    return <>{children}</>;
  }

  return (
    <>
      <Navbar
        projectName={projectName}
        showCalculator={showCalculator}
        hasTour={hasTour}
        singleUnit={singleUnit}
        unitsLabel={unitsLabel}
      />
      <div className="pt-16">{children}</div>
    </>
  );
}
