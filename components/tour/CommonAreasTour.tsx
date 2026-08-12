'use client';

import dynamic from 'next/dynamic';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import type { TourData } from '@/types';

const VirtualTour = dynamic(() => import('./VirtualTour'), { ssr: false });

interface CommonAreasTourProps {
  projectName: string;
  projectSlug: string;
  tourData: TourData;
  /** Nodo en el que arranca el recorrido — si no se pasa, usa tourData.initialNodeId */
  focusNodeId?: string;
  /** Texto de la pill de estado, ej: "Recorrido de espacios comunes" o "Recorrido — Torre A" */
  label?: string;
  /** A dónde vuelve el botón "Volver" — por default, a la vista aérea del proyecto */
  backHref?: string;
  backLabel?: string;
  embed?: boolean;
}

export default function CommonAreasTour({
  projectName,
  projectSlug,
  tourData,
  focusNodeId,
  label,
  backHref,
  backLabel = 'Volver a la vista aérea',
  embed = false,
}: CommonAreasTourProps) {
  const router = useTransitionRouter();

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <VirtualTour tourData={tourData} focusNodeId={focusNodeId} />

      {!embed && (
        <div className="absolute top-0 left-0 right-0 z-20 p-4 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
          <button
            onClick={() => router.push(backHref ?? `/proyecto/${projectSlug}`)}
            aria-label={backLabel}
            className="glass rounded-xl px-3 py-2.5 sm:px-4 flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors hover:bg-white/10 pointer-events-auto shrink-0"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">{backLabel}</span>
          </button>

          <div className="glass rounded-xl px-4 py-2.5 pointer-events-auto min-w-0 max-w-[75vw] sm:max-w-none">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-sm font-medium text-white/90 truncate">{label ?? `Recorrido de espacios comunes · ${projectName}`}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
