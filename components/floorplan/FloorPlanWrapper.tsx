'use client';

import dynamic from 'next/dynamic';
import type { Building, Unit, Amenity, PointOfInterest, BimModel } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

// Sin ssr:false a propósito: la ficha y el plano tienen que estar en el HTML inicial
// (SEO, y que se vea contenido antes de bajar el bundle). dynamic() queda por el code-splitting.
const FloorPlanViewer = dynamic(() => import('./FloorPlanViewer'));

export default function FloorPlanWrapper({
  building,
  units,
  projectSlug,
  amenities,
  pointsOfInterest,
  initialFloor,
  typeConfig,
  buildings,
  bimModels,
}: {
  building: Building;
  units: Unit[];
  projectSlug: string;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  initialFloor?: number;
  typeConfig: ProjectTypeConfig;
  buildings?: { id: string; name: string }[];
  bimModels?: BimModel[];
}) {
  return (
    <FloorPlanViewer
      building={building}
      units={units}
      projectSlug={projectSlug}
      amenities={amenities}
      pointsOfInterest={pointsOfInterest}
      initialFloor={initialFloor}
      typeConfig={typeConfig}
      buildings={buildings}
      bimModels={bimModels}
    />
  );
}
