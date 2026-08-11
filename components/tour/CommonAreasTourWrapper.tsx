'use client';

import dynamic from 'next/dynamic';
import type { TourData } from '@/types';

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
}

export default function CommonAreasTourWrapper(props: CommonAreasTourWrapperProps) {
  return <CommonAreasTour {...props} />;
}
