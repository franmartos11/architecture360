'use client';

import dynamic from 'next/dynamic';
import type { Unit, Amenity, PointOfInterest } from '@/types';

const UnitViewer = dynamic(() => import('./UnitViewer'), { ssr: false });

interface UnitViewerWrapperProps {
  unit: Unit;
  projectSlug: string;
  projectName: string;
  buildingId: string;
  floorNumber: number;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  projectLocation?: string;
  projectLatitude?: number;
  projectLongitude?: number;
}

export default function UnitViewerWrapper(props: UnitViewerWrapperProps) {
  return <UnitViewer {...props} />;
}
