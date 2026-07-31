'use client';

import { useEffect, useRef, useState } from 'react';

interface VirtualTourProps {
  imageUrl: string;
  initialView?: {
    yaw: number;
    pitch: number;
    fov: number;
  };
}

export default function VirtualTour({ imageUrl, initialView }: VirtualTourProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof Object> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viewer: ReturnType<typeof Object> | null = null;

    async function initMarzipano() {
      if (!containerRef.current) return;

      try {
        // Dynamic import of Marzipano (client-side only)
        const Marzipano = (await import('marzipano')).default;

        // Create viewer
        viewer = new Marzipano.Viewer(containerRef.current, {
          controls: {
            mouseViewMode: 'drag',
          },
        });

        // Create an equirectangular geometry
        const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);

        // Create a rectilinear view with initial parameters
        const limiter = Marzipano.RectilinearView.limit.traditional(
          4096,
          100 * Math.PI / 180
        );

        const view = new Marzipano.RectilinearView(
          {
            yaw: initialView?.yaw ?? 0,
            pitch: initialView?.pitch ?? 0,
            fov: initialView?.fov ?? Math.PI / 2,
          },
          limiter
        );

        // Create the image source from a single equirectangular image URL
        const source = Marzipano.ImageUrlSource.fromString(imageUrl);

        // Create scene and switch to it
        const scene = viewer.createScene({
          source,
          geometry,
          view,
          pinFirstLevel: true,
        });

        scene.switchTo({ transitionDuration: 1000 });

        // Start autorotate after a brief pause
        const autorotate = Marzipano.autorotate({
          yawSpeed: 0.03,
          targetPitch: 0,
          targetFov: Math.PI / 2,
        });

        viewer.setIdleMovement(3000, autorotate);
        viewer.startMovement(autorotate);

        viewerRef.current = viewer;
        setIsLoading(false);
      } catch (err) {
        console.error('Error initializing Marzipano:', err);
        setError('Error al cargar el visor 360°');
        setIsLoading(false);
      }
    }

    initMarzipano();

    // Cleanup
    return () => {
      if (viewer && typeof (viewer as { destroy?: () => void }).destroy === 'function') {
        (viewer as { destroy: () => void }).destroy();
      }
      viewerRef.current = null;
    };
  }, [imageUrl, initialView]);

  return (
    <div className="relative w-full h-full">
      {/* Marzipano container */}
      <div
        ref={containerRef}
        className="pano-container"
      />

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-50/90 backdrop-blur-sm">
          <div className="relative w-16 h-16 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-brand-500/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-500 animate-spin" />
          </div>
          <p className="text-sm text-white/50 font-medium">Cargando tour virtual...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-surface-50/90">
          <svg className="w-12 h-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-white/60">{error}</p>
        </div>
      )}

      {/* Drag hint (shows briefly) */}
      {!isLoading && !error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-fade-in-up">
          <div className="glass rounded-full px-4 py-2 flex items-center gap-2">
            <svg className="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
            <span className="text-xs text-white/50">Arrastrá para explorar</span>
          </div>
        </div>
      )}
    </div>
  );
}
