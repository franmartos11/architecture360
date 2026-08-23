'use client';

import dynamic from 'next/dynamic';
import type { TourData } from '@/types';
import type { SunAzimuths } from '@/lib/sun-position';

const CommonAreasTour = dynamic(() => import('./CommonAreasTour'), { ssr: false });

interface CommonAreasTourWrapperProps {
  projectName: string;
  projectSlug: string;
  tourData: TourData;
  focusNodeId?: string;
  label?: string;
  backHref?: string;
  backLabel?: string;
  embed?: boolean;
  /** Grados desde el norte real hacia donde apunta yaw=0 — sin esto no se puede ubicar el sol, así que no se muestra el indicador. */
  orientationDegrees?: number;
  sunAzimuths?: SunAzimuths | null;
}

export default function CommonAreasTourWrapper(props: CommonAreasTourWrapperProps) {
  return <CommonAreasTour {...props} />;
}
