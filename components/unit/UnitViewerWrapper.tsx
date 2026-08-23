'use client';

import dynamic from 'next/dynamic';
import type { Unit, Amenity, PointOfInterest, UnitViewTab } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

const UnitViewer = dynamic(() => import('./UnitViewer'), { ssr: false });

interface UnitViewerWrapperProps {
  unit: Unit;
  allUnits: Unit[];
  projectSlug: string;
  projectName: string;
  buildingId: string;
  floorNumber: number;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  projectLocation?: string;
  projectLatitude?: number;
  projectLongitude?: number;
  initialTab?: UnitViewTab;
  typeConfig: ProjectTypeConfig;
}

export default function UnitViewerWrapper(props: UnitViewerWrapperProps) {
  return <UnitViewer {...props} />;
}
