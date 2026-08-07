'use client';

import { useEffect, useRef } from 'react';
import type { Scene, RectilinearView, Hotspot } from 'marzipano';

interface MarkerData {
  yaw: number;
  pitch: number;
}

interface TourNodeViewerProps {
  imageUrl: string;
  linkHotspots: MarkerData[];
  infoHotspots: MarkerData[];
  placing: 'link' | 'info' | null;
  onPlace: (yaw: number, pitch: number) => void;
}

// Muestra una panorámica 360° editable: en modo "placing" un click
// captura el yaw/pitch de ese punto (vía view.screenToCoordinates) y
// se lo pasa al padre para que arme el hotspot. Los hotspots ya
// existentes se muestran como marcadores numerados de referencia.
export default function TourNodeViewer({ imageUrl, linkHotspots, infoHotspots, placing, onPlace }: TourNodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RectilinearView | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const markerElsRef = useRef<Hotspot[]>([]);

  const renderMarkers = (scene: Scene, links: MarkerData[], infos: MarkerData[]) => {
    markerElsRef.current.forEach(h => scene.hotspotContainer().destroyHotspot(h));
    markerElsRef.current = [];
    links.forEach((h, i) => {
      const el = document.createElement('div');
      el.className = 'admin-hotspot-marker link';
      el.textContent = String(i + 1);
      markerElsRef.current.push(scene.hotspotContainer().createHotspot(el, { yaw: h.yaw, pitch: h.pitch }));
    });
    infos.forEach(h => {
      const el = document.createElement('div');
      el.className = 'admin-hotspot-marker info';
      el.textContent = 'i';
      markerElsRef.current.push(scene.hotspotContainer().createHotspot(el, { yaw: h.yaw, pitch: h.pitch }));
    });
  };

  useEffect(() => {
    let viewer: InstanceType<typeof import('marzipano').default.Viewer> | undefined;
    let cancelled = false;

    (async () => {
      const Marzipano = (await import('marzipano')).default;
      if (cancelled || !containerRef.current) return;

      viewer = new Marzipano.Viewer(containerRef.current, { controls: { mouseViewMode: 'drag' } });
      const source = Marzipano.ImageUrlSource.fromString(imageUrl);
      const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
      const limiter = Marzipano.RectilinearView.limit.traditional(4096, (130 * Math.PI) / 180);
      const view = new Marzipano.RectilinearView({ yaw: 0, pitch: 0, fov: Math.PI / 2 }, limiter);
      const scene = viewer.createScene({ source, geometry, view, pinFirstLevel: true });
      scene.switchTo({ transitionDuration: 0 });

      viewRef.current = view;
      sceneRef.current = scene;
      renderMarkers(scene, linkHotspots, infoHotspots);
    })();

    return () => {
      cancelled = true;
      viewer?.destroy();
      viewRef.current = null;
      sceneRef.current = null;
      markerElsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los hotspots se sincronizan en el efecto de abajo, no acá
  }, [imageUrl]);

  useEffect(() => {
    if (sceneRef.current) renderMarkers(sceneRef.current, linkHotspots, infoHotspots);
  }, [linkHotspots, infoHotspots]);

  const handleClick = (e: React.MouseEvent) => {
    if (!placing || !viewRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const coords = viewRef.current.screenToCoordinates({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    onPlace(coords.yaw, coords.pitch);
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden"
      style={{ cursor: placing ? 'crosshair' : 'grab' }}
    />
  );
}
