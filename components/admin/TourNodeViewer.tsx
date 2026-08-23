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
  onMoveLink?: (index: number, yaw: number, pitch: number) => void;
  onMoveInfo?: (index: number, yaw: number, pitch: number) => void;
}

// "create" ubica un hotspot que todavía no existe — no hay nada real que
// mover todavía, así que se previsualiza con un pin fantasma en pantalla
// hasta soltar. "move" arrastra un hotspot que YA existe: se reposiciona
// el marcador real en vivo (Hotspot.setPosition) para que quede exactamente
// donde se soltó, sin esperar a que vuelva la confirmación del guardado —
// si no, mientras tarda el guardado el pin vuelve a la posición vieja y
// recién "teletransporta" a la nueva cuando responde el server.
type DragMode =
  | { kind: 'create'; hotspotKind: 'link' | 'info' }
  | { kind: 'move'; hotspotKind: 'link' | 'info'; index: number; hotspot: Hotspot; el: HTMLElement };

const LINK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12h15m0 0l-6.75-6.75M19.5 12l-6.75 6.75" /></svg>';

// Qué tan cerca del borde del contenedor hay que arrastrar el pin para que
// la cámara empiece a rotar sola hacia ese lado, y qué tan rápido rota una
// vez que está pegado al borde.
const EDGE_ZONE_RATIO = 0.14;
const EDGE_ZONE_MIN = 40;
const EDGE_ZONE_MAX = 90;
const MAX_YAW_SPEED = 1.6; // rad/s
const MAX_PITCH_SPEED = 0.9; // rad/s

// Muestra una panorámica 360° editable. Fuera de modo "placing" se puede
// arrastrar para mirar alrededor (control nativo de Marzipano). En modo
// "placing" ese drag nativo se desactiva y el mousedown/drag/mouseup pasan
// a mover un pin fantasma que sigue al cursor — si lo arrastrás cerca de un
// borde, la cámara panea sola hacia ese lado para que no haga falta rotar
// a mano antes de poder ubicar el punto. Los hotspots ya existentes se
// muestran con ícono + etiqueta (mismo lenguaje visual que el visor
// público), son clickeables para borrarlos ahí mismo, y se pueden agarrar
// del ícono y arrastrar a un nuevo lugar para corregir la posición sin
// borrar y recrear.
export default function TourNodeViewer({ imageUrl, linkHotspots, infoHotspots, placing, onPlace, onDeleteLink, onDeleteInfo, onMoveLink, onMoveInfo }: TourNodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ReturnType<typeof Object> | null>(null);
  const viewRef = useRef<RectilinearView | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const markerElsRef = useRef<Hotspot[]>([]);
  const onDeleteLinkRef = useRef(onDeleteLink);
  const onDeleteInfoRef = useRef(onDeleteInfo);
  const onMoveLinkRef = useRef(onMoveLink);
  const onMoveInfoRef = useRef(onMoveInfo);
  const placingRef = useRef(placing);
  const dragRef = useRef<{ active: boolean; x: number; y: number; mode: DragMode } | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastTickRef = useRef(0);

  useEffect(() => {
    onDeleteLinkRef.current = onDeleteLink;
    onDeleteInfoRef.current = onDeleteInfo;
    onMoveLinkRef.current = onMoveLink;
    onMoveInfoRef.current = onMoveInfo;
  });

  useEffect(() => {
    placingRef.current = placing;
  }, [placing]);

  const clampToContainer = (clientX: number, clientY: number) => {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: Math.min(Math.max(clientX - rect.left, 0), rect.width),
      y: Math.min(Math.max(clientY - rect.top, 0), rect.height),
      rect,
    };
  };

  const positionGhost = (x: number, y: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  };

  const stopDragLoop = () => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  };

  // Corre en cada frame mientras dura el arrastre: panea la cámara si el
  // cursor está pegado a un borde, y si se está moviendo un hotspot
  // existente, lo reposiciona ahí mismo. Recalcular esto último acá (no
  // solo en mousemove) es lo que evita que el pin se despegue del cursor
  // cuando la cámara panea sola con el mouse quieto sobre el borde.
  const dragTick = (timestamp: number) => {
    const drag = dragRef.current;
    const view = viewRef.current;
    const container = containerRef.current;
    if (!drag?.active || !view || !container) { stopDragLoop(); return; }

    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.1) : 0;
    lastTickRef.current = timestamp;

    const rect = container.getBoundingClientRect();
    const zoneX = Math.min(Math.max(rect.width * EDGE_ZONE_RATIO, EDGE_ZONE_MIN), EDGE_ZONE_MAX);
    const zoneY = Math.min(Math.max(rect.height * EDGE_ZONE_RATIO, EDGE_ZONE_MIN), EDGE_ZONE_MAX);

    let yawDelta = 0;
    if (drag.x < zoneX) yawDelta = -MAX_YAW_SPEED * (1 - drag.x / zoneX);
    else if (drag.x > rect.width - zoneX) yawDelta = MAX_YAW_SPEED * (1 - (rect.width - drag.x) / zoneX);

    let pitchDelta = 0;
    if (drag.y < zoneY) pitchDelta = MAX_PITCH_SPEED * (1 - drag.y / zoneY);
    else if (drag.y > rect.height - zoneY) pitchDelta = -MAX_PITCH_SPEED * (1 - (rect.height - drag.y) / zoneY);

    if (yawDelta !== 0) view.setYaw(view.yaw() + yawDelta * dt);
    if (pitchDelta !== 0) view.setPitch(view.pitch() + pitchDelta * dt);

    // Si algo externo (ej. el padre re-renderiza con datos nuevos) destruyó
    // y recreó los marcadores en medio de este arrastre, el hotspot
    // capturado al empezar ya no es válido — cortar acá en vez de romper
    // contra un objeto destruido.
    if (drag.mode.kind === 'move' && !markerElsRef.current.includes(drag.mode.hotspot)) {
      dragRef.current = null;
      stopDragLoop();
      return;
    }

    if (drag.mode.kind === 'move') {
      const coords = view.screenToCoordinates({ x: drag.x, y: drag.y });
      drag.mode.hotspot.setPosition(coords);
    }

    rafIdRef.current = requestAnimationFrame(dragTick);
  };

  // Registrados con capital 'Pointer' (no 'Mouse') a propósito: unifican
  // mouse, touch y lápiz en un solo modelo de evento. Antes esto era
  // mousedown/mousemove/mouseup y en tablet no reaccionaba a nada — el
  // dedo ni siquiera disparaba estos listeners, así que el control táctil
  // propio de Marzipano (touchView, ver abajo) se quedaba con el gesto y
  // paneaba la cámara en vez de ubicar el pin.
  const removeDragListeners = () => {
    window.removeEventListener('pointermove', handleWindowPointerMove);
    window.removeEventListener('pointerup', handleWindowPointerUp);
    window.removeEventListener('pointercancel', handleWindowPointerCancel);
  };

  const restoreControls = () => {
    stopDragLoop();
    lastTickRef.current = 0;
    const controls = viewerRef.current?.controls?.();
    controls?.enableMethod?.('mouseViewDrag');
    controls?.enableMethod?.('touchView');
    if (containerRef.current) containerRef.current.style.cursor = placingRef.current ? 'crosshair' : 'grab';
  };

  const endDrag = (clientX: number, clientY: number) => {
    removeDragListeners();
    restoreControls();

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag?.active || !viewRef.current || !containerRef.current) return;

    if (drag.mode.kind === 'create') {
      if (ghostRef.current) ghostRef.current.style.display = 'none';
      const { x, y } = clampToContainer(clientX, clientY);
      const coords = viewRef.current.screenToCoordinates({ x, y });
      onPlace(coords.yaw, coords.pitch);
    } else {
      drag.mode.el.classList.remove('is-dragging');
      if (!markerElsRef.current.includes(drag.mode.hotspot)) return;
      // El hotspot ya está en su posición final (se fue actualizando en
      // cada frame) — se persiste exactamente esa, no una recalculada de
      // nuevo a partir del mouseup.
      const { yaw, pitch } = drag.mode.hotspot.position();
      const move = drag.mode.hotspotKind === 'link' ? onMoveLinkRef.current : onMoveInfoRef.current;
      move?.(drag.mode.index, yaw, pitch);
    }
  };

  // El gesto se cancela (llamada entrante, el SO se lo lleva para otro
  // gesto, etc.) sin una posición final confiable — se corta sin
  // confirmar ubicación ni mover el hotspot, a diferencia de endDrag.
  const cancelDrag = () => {
    removeDragListeners();
    restoreControls();
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.mode.kind === 'create' && ghostRef.current) ghostRef.current.style.display = 'none';
    if (drag?.mode.kind === 'move') drag.mode.el.classList.remove('is-dragging');
  };

  const handleWindowPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag?.active || !containerRef.current) return;
    const { x, y } = clampToContainer(e.clientX, e.clientY);
    drag.x = x;
    drag.y = y;
    if (drag.mode.kind === 'create') positionGhost(x, y);
  };

  const handleWindowPointerUp = (e: PointerEvent) => endDrag(e.clientX, e.clientY);
  const handleWindowPointerCancel = () => cancelDrag();

  // Punto de entrada común para arrastrar: ubicar un hotspot nuevo (desde
  // el contenedor, en modo placing) o mover uno ya existente (desde su
  // propio ícono, sin importar si placing está activo). En ambos casos se
  // desactiva el drag nativo de Marzipano — compite por el mismo gesto — y
  // dragTick de arriba pasa a hacerse cargo de rotar la cámara y, si
  // corresponde, reposicionar el hotspot mientras se arrastra.
  const beginDrag = (clientX: number, clientY: number, mode: DragMode) => {
    if (!viewRef.current || !containerRef.current) return;
    const { x, y } = clampToContainer(clientX, clientY);
    dragRef.current = { active: true, x, y, mode };
    const controls = viewerRef.current?.controls?.();
    // Desactiva TANTO el drag de mouse como el de touch de Marzipano —
    // sin el segundo, arrastrar con el dedo panea la cámara en vez de
    // mover el pin, porque Marzipano registra 'touchView' aparte de
    // 'mouseViewDrag' y lo deja habilitado por default (ver
    // registerDefaultControls.js).
    controls?.disableMethod?.('mouseViewDrag');
    controls?.disableMethod?.('touchView');
    containerRef.current.style.cursor = 'grabbing';
    if (mode.kind === 'create') {
      if (ghostRef.current) {
        ghostRef.current.style.display = '';
        ghostRef.current.className = `admin-tour-ghost-pin admin-tour-marker ${mode.hotspotKind}`;
        ghostRef.current.innerHTML = `<div class="marker-icon">${mode.hotspotKind === 'link' ? LINK_ICON : '<span class="marker-info-glyph">i</span>'}</div>`;
      }
      positionGhost(x, y);
    } else {
      mode.el.classList.add('is-dragging');
    }
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerCancel);
    lastTickRef.current = 0;
    rafIdRef.current = requestAnimationFrame(dragTick);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!placing) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    beginDrag(e.clientX, e.clientY, { kind: 'create', hotspotKind: placing });
  };

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
        // pointerdown, no mousedown: el drag del ícono padre ahora escucha
        // pointerdown, así que en touch un toque acá también lo dispararía
        // si solo cortáramos el mousedown.
        deleteBtn.addEventListener('pointerdown', e => e.stopPropagation());
        deleteBtn.addEventListener('click', e => {
          e.stopPropagation();
          onDelete?.();
        });
      }
      return el;
    };

    links.forEach((h, i) => {
      const el = buildMarker('link', h.label, () => onDeleteLinkRef.current?.(i));
      const hotspot = scene.hotspotContainer().createHotspot(el, { yaw: h.yaw, pitch: h.pitch });
      markerElsRef.current.push(hotspot);
      const iconEl = el.querySelector('.marker-icon');
      if (iconEl instanceof HTMLElement) {
        iconEl.addEventListener('pointerdown', e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.stopPropagation();
          e.preventDefault();
          beginDrag(e.clientX, e.clientY, { kind: 'move', hotspotKind: 'link', index: i, hotspot, el });
        });
      }
    });
    infos.forEach((h, i) => {
      const el = buildMarker('info', h.label, () => onDeleteInfoRef.current?.(i));
      const hotspot = scene.hotspotContainer().createHotspot(el, { yaw: h.yaw, pitch: h.pitch });
      markerElsRef.current.push(hotspot);
      const iconEl = el.querySelector('.marker-icon');
      if (iconEl instanceof HTMLElement) {
        iconEl.addEventListener('pointerdown', e => {
          if (e.pointerType === 'mouse' && e.button !== 0) return;
          e.stopPropagation();
          e.preventDefault();
          beginDrag(e.clientX, e.clientY, { kind: 'move', hotspotKind: 'info', index: i, hotspot, el });
        });
      }
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

      viewerRef.current = viewer;
      viewRef.current = view;
      sceneRef.current = scene;
      renderMarkers(scene, linkHotspots, infoHotspots);
    })();

    return () => {
      cancelled = true;
      viewer?.destroy();
      viewerRef.current = null;
      viewRef.current = null;
      sceneRef.current = null;
      markerElsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- los hotspots se sincronizan en el efecto de abajo, no acá
  }, [imageUrl]);

  useEffect(() => {
    if (sceneRef.current) renderMarkers(sceneRef.current, linkHotspots, infoHotspots);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- renderMarkers se recrea cada render pero hace lo mismo; solo hay que re-sincronizar cuando cambian los hotspots
  }, [linkHotspots, infoHotspots]);

  // Marzipano solo redimensiona su canvas interno cuando cambia la ventana
  // — si el contenedor cambia de tamaño por CSS/flexbox (ej. al desplegar
  // el panel de "agregar hotspot" debajo, o al estirar la ventana) sin que
  // cambie el tamaño de la ventana, hay que avisarle a mano con
  // updateSize() o la panorámica queda estirada/distorsionada.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => {
      viewerRef.current?.updateSize?.();
    });
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    return () => {
      removeDragListeners();
      stopDragLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listeners de limpieza al desmontar, no hace falta re-sincronizar
  }, []);

  return (
    <div className="relative w-full aspect-video bg-gray-900 rounded-xl overflow-hidden">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        className="absolute inset-0"
        // touch-action: none — si no, en modo "placing" el navegador
        // interpreta el arrastre con el dedo como scroll/gesto propio
        // antes de que llegue a nuestro pointerdown/pointermove.
        style={{ cursor: placing ? 'crosshair' : 'grab', touchAction: 'none' }}
      />
      <div ref={ghostRef} className="admin-tour-ghost-pin" style={{ display: 'none' }} />
    </div>
  );
}
