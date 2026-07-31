'use client';

import dynamic from 'next/dynamic';
import type { Building } from '@/types';

const FloorPlanViewer = dynamic(() => import('./FloorPlanViewer'), { ssr: false });

export default function FloorPlanWrapper({
  building,
  projectSlug,
  initialFloor,
}: {
  building: Building;
  projectSlug: string;
  initialFloor?: number;
}) {
  return <FloorPlanViewer building={building} projectSlug={projectSlug} initialFloor={initialFloor} />;
}
