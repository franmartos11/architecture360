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
  projectLocation,
  projectLatitude,
  projectLongitude,
  initialFloor,
}: {
  building: Building;
  units: Unit[];
  projectSlug: string;
  projectName: string;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  projectLocation?: string;
  projectLatitude?: number;
  projectLongitude?: number;
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
      projectLocation={projectLocation}
      projectLatitude={projectLatitude}
      projectLongitude={projectLongitude}
      initialFloor={initialFloor}
    />
  );
}
