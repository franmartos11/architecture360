'use client';

import dynamic from 'next/dynamic';
import type { Building, Unit, Amenity, PointOfInterest } from '@/types';

const FloorPlanViewer = dynamic(() => import('./FloorPlanViewer'), { ssr: false });

export default function FloorPlanWrapper({
  building,
  units,
  projectSlug,
  projectName,
  amenities,
  pointsOfInterest,
  initialFloor,
}: {
  building: Building;
  units: Unit[];
  projectSlug: string;
  projectName: string;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  initialFloor?: number;
}) {
  return (
    <FloorPlanViewer
      building={building}
      units={units}
      projectSlug={projectSlug}
      projectName={projectName}
      amenities={amenities}
      pointsOfInterest={pointsOfInterest}
      initialFloor={initialFloor}
    />
  );
}
