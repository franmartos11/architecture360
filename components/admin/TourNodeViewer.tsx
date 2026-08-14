'use client';

import { useEffect, useRef } from 'react';
import type { Scene, RectilinearView, Hotspot } from 'marzipano';

interface HotspotMarker {
  yaw: number;
  pitch: number;
  label: string;
}

interface TourNodeViewerProps {
  imageUrl: string;
  linkHotspots: HotspotMarker[];
  infoHotspots: HotspotMarker[];
  placing: 'link' | 'info' | null;
  onPlace: (yaw: number, pitch: number) => void;
  onDeleteLink?: (index: number) => void;
  onDeleteInfo?: (index: number) => void;
}

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>';

// Muestra una panorámica 360° editable: en modo "placing" un click
// captura el yaw/pitch de ese punto (vía view.screenToCoordinates) y se lo
// pasa al padre para que arme el hotspot. Los hotspots ya existentes se
// muestran con ícono + etiqueta (mismo lenguaje visual que el visor
// público) y son clickeables para borrarlos ahí mismo.
export default function TourNodeViewer({ imageUrl, linkHotspots, infoHotspots, placing, onPlace, onDeleteLink, onDeleteInfo }: TourNodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<RectilinearView | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const markerElsRef = useRef<Hotspot[]>([]);
  const onDeleteLinkRef = useRef(onDeleteLink);
  const onDeleteInfoRef = useRef(onDeleteInfo);

  useEffect(() => {
    onDeleteLinkRef.current = onDeleteLink;
    onDeleteInfoRef.current = onDeleteInfo;
  });

  const renderMarkers = (scene: Scene, links: HotspotMarker[], infos: HotspotMarker[]) => {
    markerElsRef.current.forEach(h => scene.hotspotContainer().destroyHotspot(h));
    markerElsRef.current = [];

    const buildMarker = (kind: 'link' | 'info', label: string, onDelete?: () => void) => {
      const el = document.createElement('div');
      el.className = `admin-tour-marker ${kind}`;
      el.innerHTML = `
        <div class="marker-icon">
          ${kind === 'link' ? LINK_ICON : '<span class="marker-info-glyph">i</span>'}
          <button type="button" class="marker-delete" aria-label="Borrar">×</button>
        </div>
        <span class="marker-label">${label}</span>
      `;
      // Evita que un click en el marcador burbujee al contenedor y se
      // interprete como "ubicar un hotspot nuevo acá" en modo placing.
      el.addEventListener('click', e => e.stopPropagation());
      const deleteBtn = el.querySelector('.marker-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', e => {
          e.stopPropagation();
          onDelete?.();
        });
      }
      return el;
    };

    links.forEach((h, i) => {
      const el = buildMarker('link', h.label, () => onDeleteLinkRef.current?.(i));
      markerElsRef.current.push(scene.hotspotContainer().createHotspot(el, { yaw: h.yaw, pitch: h.pitch }));
    });
    infos.forEach((h, i) => {
      const el = buildMarker('info', h.label, () => onDeleteInfoRef.current?.(i));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los callbacks de borrado viajan por ref, no hace falta re-sincronizar por ellos
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
