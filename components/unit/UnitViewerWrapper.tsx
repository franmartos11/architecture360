'use client';

import dynamic from 'next/dynamic';
import type { Unit } from '@/types';

const UnitViewer = dynamic(() => import('./UnitViewer'), { ssr: false });

interface UnitViewerWrapperProps {
  unit: Unit;
  projectSlug: string;
  buildingId: string;
  floorNumber: number;
}

export default function UnitViewerWrapper(props: UnitViewerWrapperProps) {
  return <UnitViewer {...props} />;
}
