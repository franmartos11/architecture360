'use client';

import dynamic from 'next/dynamic';
import { m as motion } from 'framer-motion';
import type { Unit } from '@/types';

const VirtualTour = dynamic(() => import('@/components/tour/VirtualTour'), { ssr: false });

export default function Tour360Tab({
  unit,
  focusNodeId,
  isFullscreen,
  onFullscreenChange,
}: {
  unit: Unit;
  focusNodeId?: string;
  isFullscreen: boolean;
  onFullscreenChange: (fullscreen: boolean) => void;
}) {
  return (
    <motion.div
      key="tour360"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className={isFullscreen ? 'fixed inset-0 z-[100] bg-black animate-in zoom-in duration-300' : 'absolute inset-0 pt-16'}
    >
      <div className="relative w-full h-full overflow-hidden shadow-inner">
        <VirtualTour imageUrl={unit.tourImageUrl} tourData={unit.tourData} focusNodeId={focusNodeId} />
        {isFullscreen ? (
          <button
            onClick={() => onFullscreenChange(false)}
            className="absolute top-6 left-6 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center justify-center text-white backdrop-blur z-[110] transition-colors shadow-2xl"
            title="Salir de pantalla completa"
            aria-label="Salir de pantalla completa"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <button
            onClick={() => onFullscreenChange(true)}
            className="absolute top-6 left-6 w-12 h-12 rounded-full bg-gray-900/80 hover:bg-gray-900 border border-white/10 flex items-center justify-center text-white backdrop-blur z-[110] transition-colors shadow-lg"
            title="Pantalla completa"
            aria-label="Pantalla completa"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
