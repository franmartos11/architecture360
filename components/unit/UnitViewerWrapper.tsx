'use client';

import dynamic from 'next/dynamic';
import type { Unit, Amenity, PointOfInterest, UnitViewTab } from '@/types';
import type { ProjectTypeConfig } from '@/lib/project-types';

// Sin ssr:false a propósito: la ficha y el plano tienen que estar en el HTML inicial
// (SEO, y que se vea contenido antes de bajar el bundle). dynamic() queda por el code-splitting.
const UnitViewer = dynamic(() => import('./UnitViewer'));

interface UnitViewerWrapperProps {
  unit: Unit;
  allUnits: Unit[];
  bimModel?: import('@/types').BimModel;
  projectSlug: string;
  projectName: string;
  buildingId: string;
  buildingName: string;
  floorNumber: number;
  amenities?: Amenity[];
  pointsOfInterest?: PointOfInterest[];
  projectLocation?: string;
  projectLatitude?: number;
  projectLongitude?: number;
  initialTab?: UnitViewTab;
  typeConfig: ProjectTypeConfig;
  /** Listado filtrado del que vino el usuario, para poder volver a él. Ausente si llegó por un link directo. */
  backHref?: string;
}

export default function UnitViewerWrapper(props: UnitViewerWrapperProps) {
  return <UnitViewer {...props} />;
}
