'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import TourControls from '@/components/tour/TourControls';

const VirtualTour = dynamic(
  () => import('@/components/tour/VirtualTour'),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-surface-50">
        <LoadingSpinner text="Iniciando visor 360°..." />
      </div>
    ),
  }
);

interface VirtualTourWrapperProps {
  imageUrl: string;
  initialView?: {
    yaw: number;
    pitch: number;
    fov: number;
  };
  unitName: string;
  projectSlug: string;
}

export default function VirtualTourWrapper({
  imageUrl,
  initialView,
  unitName,
  projectSlug,
}: VirtualTourWrapperProps) {
  return (
    <>
      <VirtualTour imageUrl={imageUrl} initialView={initialView} />
      <TourControls unitName={unitName} projectSlug={projectSlug} />
    </>
  );
}
