'use client';

import dynamic from 'next/dynamic';
import type { Building, Unit } from '@/types';

const FloorPlanViewer = dynamic(() => import('./FloorPlanViewer'), { ssr: false });

export default function FloorPlanWrapper({
  building,
  units,
  projectSlug,
  initialFloor,
}: {
  building: Building;
  units: Unit[];
  projectSlug: string;
  initialFloor?: number;
}) {
  return <FloorPlanViewer building={building} units={units} projectSlug={projectSlug} initialFloor={initialFloor} />;
}
