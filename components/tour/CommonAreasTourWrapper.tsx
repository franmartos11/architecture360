'use client';

import dynamic from 'next/dynamic';
import type { TourData } from '@/types';

const CommonAreasTour = dynamic(() => import('./CommonAreasTour'), { ssr: false });

interface CommonAreasTourWrapperProps {
  projectName: string;
  projectSlug: string;
  tourData: TourData;
}

export default function CommonAreasTourWrapper(props: CommonAreasTourWrapperProps) {
  return <CommonAreasTour {...props} />;
}
