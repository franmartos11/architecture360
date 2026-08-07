'use client';

import dynamic from 'next/dynamic';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import type { TourData } from '@/types';

const VirtualTour = dynamic(() => import('./VirtualTour'), { ssr: false });

interface CommonAreasTourProps {
  projectName: string;
  projectSlug: string;
  tourData: TourData;
}

export default function CommonAreasTour({ projectName, projectSlug, tourData }: CommonAreasTourProps) {
  const router = useTransitionRouter();

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <VirtualTour tourData={tourData} />

      <div className="absolute top-0 left-0 right-0 z-20 p-4 flex items-center justify-between pointer-events-none">
        <button
          onClick={() => router.push(`/proyecto/${projectSlug}`)}
          className="glass rounded-xl px-4 py-2.5 flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors hover:bg-white/10 pointer-events-auto"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Volver a la vista aérea
        </button>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="glass rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm font-medium text-white/90">Recorrido de espacios comunes · {projectName}</span>
            </div>
          </div>
          <button
            onClick={() => router.push(`/proyecto/${projectSlug}/edificio/torre-a`)}
            className="glass rounded-xl px-4 py-2.5 text-sm text-white/80 hover:text-white transition-colors hover:bg-white/10"
          >
            Ver plano de Torre A
          </button>
        </div>
      </div>
    </div>
  );
}
