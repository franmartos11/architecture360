'use client';

import { useEffect, useRef, useState } from 'react';
import type { TourData, TourNode, TourLinkHotspot, TourInfoHotspot } from '@/types';

interface VirtualTourProps {
  imageUrl?: string;
  tourData?: TourData;
  initialView?: {
    yaw: number;
    pitch: number;
    fov: number;
  };
  /** Nodo por el que arrancar el tour (ej. al entrar desde el plano de ambientes) */
  focusNodeId?: string;
}

export default function VirtualTour({ imageUrl, tourData, initialView, focusNodeId }: VirtualTourProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof Object> | null>(null);
  const scenesRef = useRef<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(focusNodeId || tourData?.initialNodeId || null);

  useEffect(() => {
    let viewer: any = null;

    async function initMarzipano() {
      if (!containerRef.current) return;

      try {
        const Marzipano = (await import('marzipano')).default;

        viewer = new Marzipano.Viewer(containerRef.current, {
          controls: {
            mouseViewMode: 'drag',
          },
        });

        const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
        const limiter = Marzipano.RectilinearView.limit.traditional(
          4096,
          100 * Math.PI / 180
        );

        if (tourData && tourData.nodes.length > 0) {
          // Multi-node tour
          tourData.nodes.forEach((node) => {
            const source = Marzipano.ImageUrlSource.fromString(node.imageUrl);
            const view = new Marzipano.RectilinearView(
              {
                yaw: node.initialView?.yaw ?? 0,
                pitch: node.initialView?.pitch ?? 0,
                fov: node.initialView?.fov ?? Math.PI / 2,
              },
              limiter
            );

            const scene = viewer.createScene({
              source,
              geometry,
              view,
              pinFirstLevel: true,
            });

            // Create Link Hotspots
            node.linkHotspots?.forEach((hotspot) => {
              const el = document.createElement('div');
              el.className = 'link-hotspot';
              el.innerHTML = `
                <div class="hotspot-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" />
                  </svg>
                </div>
                ${hotspot.label ? `<div class="hotspot-label">${hotspot.label}</div>` : ''}
              `;
              
              el.addEventListener('click', () => {
                const targetScene = scenesRef.current[hotspot.targetNodeId];
                if (targetScene) {
                  // Switch scene
                  targetScene.switchTo({ transitionDuration: 1000 });
                  setCurrentNodeId(hotspot.targetNodeId);
                  
                  // Update view if targets specified
                  if (hotspot.targetYaw !== undefined || hotspot.targetPitch !== undefined) {
                    const targetView = targetScene.view();
                    targetView.setParameters({
                      yaw: hotspot.targetYaw ?? targetView.yaw(),
                      pitch: hotspot.targetPitch ?? targetView.pitch()
                    });
                  }
                }
              });
              
              scene.hotspotContainer().createHotspot(el, { yaw: hotspot.yaw, pitch: hotspot.pitch });
            });

            // Create Info Hotspots
            node.infoHotspots?.forEach((hotspot) => {
              const el = document.createElement('div');
              el.className = 'info-hotspot group';
              el.innerHTML = `
                <div class="info-icon">i</div>
                <div class="info-tooltip group-hover:opacity-100 group-hover:visible">
                  <h4>${hotspot.title}</h4>
                  ${hotspot.description ? `<p>${hotspot.description}</p>` : ''}
                </div>
              `;
              scene.hotspotContainer().createHotspot(el, { yaw: hotspot.yaw, pitch: hotspot.pitch });
            });

            scenesRef.current[node.id] = scene;
          });

          // Switch to initial scene (respeta el nodo pedido por el llamador, si existe)
          const startNodeId = focusNodeId && scenesRef.current[focusNodeId] ? focusNodeId : tourData.initialNodeId;
          const initialScene = scenesRef.current[startNodeId];
          if (initialScene) {
            initialScene.switchTo({ transitionDuration: 0 });
            setCurrentNodeId(startNodeId);
          }

        } else if (imageUrl) {
          // Legacy single image
          const source = Marzipano.ImageUrlSource.fromString(imageUrl);
          const view = new Marzipano.RectilinearView(
            {
              yaw: initialView?.yaw ?? 0,
              pitch: initialView?.pitch ?? 0,
              fov: initialView?.fov ?? Math.PI / 2,
            },
            limiter
          );
          
          const scene = viewer.createScene({
            source,
            geometry,
            view,
            pinFirstLevel: true,
          });
          scene.switchTo({ transitionDuration: 0 });
          scenesRef.current['default'] = scene;
        }

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

    return () => {
      if (viewer && typeof viewer.destroy === 'function') {
        viewer.destroy();
      }
      viewerRef.current = null;
      scenesRef.current = {};
    };
  }, [imageUrl, tourData, initialView, focusNodeId]);

  const zoomBy = (delta: number) => {
    const view = viewerRef.current?.view?.();
    if (!view) return;
    const MIN_FOV = 0.35; // ~20° — máximo acercamiento
    const MAX_FOV = 2.0;  // ~115° — máximo alejamiento
    const next = Math.min(MAX_FOV, Math.max(MIN_FOV, view.fov() + delta));
    view.setFov(next);
  };

  return (
    <div className="relative w-full h-full">
      {/* Marzipano container */}
      <div ref={containerRef} className="pano-container w-full h-full absolute inset-0" />

      {/* Floating navigation menu (only if multi-node) */}
      {tourData && tourData.nodes.length > 1 && !isLoading && !error && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex flex-wrap justify-center gap-2 p-1.5 bg-gray-900/40 backdrop-blur-md rounded-2xl shadow-lg border border-white/10 max-w-[90vw]">
          {tourData.nodes.map(node => (
            <button
              key={node.id}
              onClick={() => {
                const targetScene = scenesRef.current[node.id];
                if (targetScene && node.id !== currentNodeId) {
                  targetScene.switchTo({ transitionDuration: 1000 });
                  setCurrentNodeId(node.id);
                }
              }}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all duration-300 ${
                currentNodeId === node.id 
                  ? 'bg-white text-gray-900 shadow-md scale-105' 
                  : 'text-white/80 hover:text-white hover:bg-white/10'
              }`}
            >
              {node.name}
            </button>
          ))}
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-900/90 backdrop-blur-sm">
          <div className="relative w-12 h-12 mb-4">
            <div className="absolute inset-0 rounded-full border-2 border-white/20" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-white animate-spin" />
          </div>
          <p className="text-sm text-white/50 font-medium tracking-wide uppercase">Cargando 360°...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gray-900/90">
          <svg className="w-12 h-12 text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-white/60">{error}</p>
        </div>
      )}

      {/* Zoom controls */}
      {!isLoading && !error && (
        <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-1.5">
          <button
            onClick={() => zoomBy(-0.15)}
            title="Acercar"
            className="w-10 h-10 rounded-full bg-gray-900/50 hover:bg-gray-900/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM21 21l-5.197-5.197M7.5 10.5h6" />
            </svg>
          </button>
          <button
            onClick={() => zoomBy(0.15)}
            title="Alejar"
            className="w-10 h-10 rounded-full bg-gray-900/50 hover:bg-gray-900/80 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM21 21l-5.197-5.197M7.5 10.5h6" />
            </svg>
          </button>
        </div>
      )}

      {/* Drag hint */}
      {!isLoading && !error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-none animate-in fade-in zoom-in duration-700 delay-1000">
          <div className="bg-gray-900/40 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2 border border-white/10 shadow-lg">
            <svg className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
            </svg>
            <span className="text-xs text-white/70 font-medium">Arrastrá para explorar · scroll o pellizcá para zoom</span>
          </div>
        </div>
      )}
    </div>
  );
}
