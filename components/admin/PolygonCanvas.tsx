'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

export interface PolygonShape {
  id: string;
  label: string;
  points: { x: number; y: number }[];
  color: string;
}

type DrawMode = 'point' | 'rectangle' | 'pin';
type Point = { x: number; y: number };

interface PolygonCanvasProps {
  imageUrl: string;
  shapes: PolygonShape[];
  activeId: string | null;
  mode?: DrawMode;
  onPointsChange: (id: string, points: Point[]) => void;
  /** Se dispara cuando el usuario "cierra" la forma (toca el primer punto o suelta el rectángulo) */
  onComplete?: (id: string) => void;
  /** Posición del pin de la forma activa — se muestra siempre, se puede arrastrar o reubicar en modo "pin" */
  pinPoint?: Point | null;
  onPinPlace?: (point: Point | null) => void;
  /** Color del ícono del pin — si no está, usa el color de la forma activa (shape.color) */
  pinColor?: string;
}

interface HistoryEntry {
  points: Point[];
  pin: Point | null;
}

const CLOSE_THRESHOLD = 3; // % — qué tan cerca del primer punto hay que estar para poder cerrar
const MAX_HISTORY = 20;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Editor visual de polígonos sobre una imagen. Dos modos:
// - "point": click para ir agregando puntos (con línea de vista previa
//   hacia el cursor), tocar el primer punto cierra y termina la forma.
// - "rectangle": un solo arrastre de esquina a esquina arma un
//   rectángulo de 4 puntos — después se puede seguir editando en modo
//   "point" para agregarle más esquinas si el ambiente no es un rectángulo.
// En ambos modos: arrastrar un punto existente lo mueve, doble click
// sobre un punto lo borra.
export default function PolygonCanvas({ imageUrl, shapes, activeId, mode = 'point', onPointsChange, onComplete, pinPoint, onPinPlace, pinColor }: PolygonCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [draggingPin, setDraggingPin] = useState(false);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({});

  const activeShape = shapes.find(s => s.id === activeId) ?? null;
  const nearFirstPoint =
    !!activeShape && activeShape.points.length >= 3 && !!cursorPos && dragIndex === null &&
    distance(cursorPos, activeShape.points[0]) < CLOSE_THRESHOLD;

  // Guarda una foto de "cómo estaba todo" antes de una acción que lo modifica,
  // para que la flechita de deshacer pueda volver un paso atrás.
  const pushHistory = useCallback((id: string, points: Point[], pin: Point | null) => {
    setHistory(prev => ({ ...prev, [id]: [...(prev[id] ?? []), { points, pin }].slice(-MAX_HISTORY) }));
  }, []);

  const undoStack = activeShape ? history[activeShape.id] ?? [] : [];
  const canUndo = undoStack.length > 0;

  const handleUndo = useCallback(() => {
    if (!activeShape || undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setHistory(prev => ({ ...prev, [activeShape.id]: prev[activeShape.id]!.slice(0, -1) }));
    onPointsChange(activeShape.id, entry.points);
    onPinPlace?.(entry.pin);
  }, [activeShape, undoStack, onPointsChange, onPinPlace]);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
    const y = Math.min(100, Math.max(0, ((clientY - rect.top) / rect.height) * 100));
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  }, []);

  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (mode !== 'rectangle' || !activeShape) return;
    setRectStart(toPercent(e.clientX, e.clientY));
  };

  const handleBackgroundClick = (e: React.MouseEvent) => {
    if (mode === 'pin') {
      if (!activeId) return;
      const point = toPercent(e.clientX, e.clientY);
      pushHistory(activeId, activeShape?.points ?? [], pinPoint ?? null);
      onPinPlace?.(point);
      return;
    }
    if (mode !== 'point' || !activeShape || dragIndex !== null) return;
    const point = toPercent(e.clientX, e.clientY);
    if (nearFirstPoint) {
      onComplete?.(activeShape.id);
      setCursorPos(null);
      return;
    }
    pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    onPointsChange(activeShape.id, [...activeShape.points, point]);
  };

  const handleVertexMouseDown = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeShape) pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    setDragIndex(index);
  };

  const handlePinMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeShape) return;
    pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    setDraggingPin(true);
  };

  const handlePinDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeShape) return;
    pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    onPinPlace?.(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = toPercent(e.clientX, e.clientY);
    if (draggingPin) {
      onPinPlace?.(point);
      return;
    }
    if (dragIndex !== null && activeShape) {
      const newPoints = activeShape.points.map((p, i) => (i === dragIndex ? point : p));
      onPointsChange(activeShape.id, newPoints);
      return;
    }
    setCursorPos(point);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (draggingPin) {
      setDraggingPin(false);
      return;
    }
    if (dragIndex !== null) {
      setDragIndex(null);
      return;
    }
    if (mode === 'rectangle' && rectStart && activeShape) {
      const end = toPercent(e.clientX, e.clientY);
      if (distance(rectStart, end) > 1) {
        const corners = [
          { x: rectStart.x, y: rectStart.y },
          { x: end.x, y: rectStart.y },
          { x: end.x, y: end.y },
          { x: rectStart.x, y: end.y },
        ];
        pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
        onPointsChange(activeShape.id, corners);
        onComplete?.(activeShape.id);
      }
      setRectStart(null);
    }
  };

  const handleVertexDoubleClick = (index: number) => (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeShape) return;
    pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    onPointsChange(activeShape.id, activeShape.points.filter((_, i) => i !== index));
  };

  const handleReset = () => {
    if (!activeShape) return;
    pushHistory(activeShape.id, activeShape.points, pinPoint ?? null);
    setDragIndex(null);
    setRectStart(null);
    setCursorPos(null);
    onPointsChange(activeShape.id, []);
  };

  // Esc cancela un arrastre de rectángulo en curso sin borrar lo que ya estaba guardado.
  // Ctrl/Cmd+Z deshace el último cambio (agregar/mover/borrar punto, rectángulo, pin o reset).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rectStart) setRectStart(null);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [rectStart, handleUndo]);

  const rectPreview = mode === 'rectangle' && rectStart && cursorPos
    ? {
        x: Math.min(rectStart.x, cursorPos.x),
        y: Math.min(rectStart.y, cursorPos.y),
        w: Math.abs(cursorPos.x - rectStart.x),
        h: Math.abs(cursorPos.y - rectStart.y),
      }
    : null;

  return (
    <div className="relative w-full select-none rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Plano" className="w-full h-auto block pointer-events-none" draggable={false} />
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        onClick={handleBackgroundClick}
        onMouseDown={handleBackgroundMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setDragIndex(null); setDraggingPin(false); setCursorPos(null); }}
        style={{
          cursor: draggingPin || dragIndex !== null
            ? 'grabbing'
            : mode === 'pin' ? 'crosshair' : activeShape ? (mode === 'rectangle' ? 'crosshair' : nearFirstPoint ? 'pointer' : 'crosshair') : 'default',
        }}
      >
        {shapes.map(shape => {
          if (shape.points.length === 0) return null;
          const isActive = shape.id === activeId;
          const pointsAttr = shape.points.map(p => `${p.x},${p.y}`).join(' ');
          return (
            <g key={shape.id} opacity={isActive ? 1 : 0.35}>
              <polygon
                points={pointsAttr}
                fill={shape.color}
                fillOpacity={isActive ? 0.3 : 0.15}
                stroke={shape.color}
                strokeWidth={0.4}
                vectorEffect="non-scaling-stroke"
              />
              {/* Línea de vista previa hacia el cursor mientras se dibuja en modo punto */}
              {isActive && mode === 'point' && cursorPos && dragIndex === null && !nearFirstPoint && (
                <line
                  x1={shape.points[shape.points.length - 1].x}
                  y1={shape.points[shape.points.length - 1].y}
                  x2={cursorPos.x}
                  y2={cursorPos.y}
                  stroke={shape.color}
                  strokeWidth={0.3}
                  strokeDasharray="1.2 1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {isActive && shape.points.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x} cy={p.y}
                  r={i === 0 && nearFirstPoint ? 2.2 : 1.3}
                  fill={i === 0 && nearFirstPoint ? shape.color : '#fff'}
                  stroke={shape.color} strokeWidth={0.6}
                  vectorEffect="non-scaling-stroke"
                  style={{ cursor: 'grab' }}
                  onMouseDown={handleVertexMouseDown(i)}
                  onClick={e => e.stopPropagation()}
                  onDoubleClick={handleVertexDoubleClick(i)}
                />
              ))}
            </g>
          );
        })}

        {/* Vista previa del rectángulo mientras se arrastra */}
        {rectPreview && activeShape && (
          <rect
            x={rectPreview.x} y={rectPreview.y} width={rectPreview.w} height={rectPreview.h}
            fill={activeShape.color} fillOpacity={0.25}
            stroke={activeShape.color} strokeWidth={0.4} strokeDasharray="1.2 1"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {/* Zona invisible para arrastrar el pin (el ícono visible se dibuja aparte, en HTML) */}
        {pinPoint && activeShape && (
          <circle
            cx={pinPoint.x} cy={pinPoint.y} r={2.5}
            fill="transparent"
            style={{ cursor: draggingPin ? 'grabbing' : 'grab' }}
            onMouseDown={handlePinMouseDown}
            onClick={e => e.stopPropagation()}
            onDoubleClick={handlePinDoubleClick}
          />
        )}
      </svg>

      {/* Números de los puntos (overlay HTML para que no se deformen con el stretch del SVG) */}
      {activeShape && activeShape.points.map((p, i) => (
        <div
          key={i}
          className="absolute pointer-events-none flex items-center justify-center text-[9px] font-bold text-white rounded-full"
          style={{
            left: `${p.x}%`, top: `${p.y}%`, transform: 'translate(-50%, -50%)',
            width: 14, height: 14, background: activeShape.color,
            boxShadow: '0 0 0 1.5px white',
          }}
        >
          {i + 1}
        </div>
      ))}

      {/* Pin — siempre visible si hay una posición (calculada o elegida a mano) */}
      {pinPoint && activeShape && (
        <div
          className="absolute pointer-events-none"
          style={{ left: `${pinPoint.x}%`, top: `${pinPoint.y}%`, transform: 'translate(-50%, -100%)' }}
        >
          <svg className="w-6 h-6 drop-shadow-lg" viewBox="0 0 24 24" fill={pinColor || activeShape.color} stroke="white" strokeWidth={1}>
            <path d="M12 2C7.6 2 4 5.6 4 10c0 6 8 12 8 12s8-6 8-12c0-4.4-3.6-8-8-8zm0 11a3 3 0 110-6 3 3 0 010 6z" />
          </svg>
        </div>
      )}
      {mode === 'pin' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-lg">
          {pinPoint ? 'Click para reubicar · arrastrá el pin · doble click para quitarlo' : 'Click para ubicar el pin'}
        </div>
      )}

      {/* Hint de "click para cerrar" */}
      {nearFirstPoint && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full pointer-events-none shadow-lg">
          Click para cerrar la forma
        </div>
      )}

      {/* Deshacer último cambio + resetear la forma activa */}
      {activeShape && (canUndo || activeShape.points.length > 0 || rectStart) && (
        <div className="absolute top-2 right-2 flex items-center gap-2">
          {canUndo && (
            <button
              onClick={handleUndo}
              title="Deshacer el último cambio (Ctrl/Cmd+Z)"
              className="flex items-center gap-1.5 bg-white/95 hover:bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg border border-gray-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L4 10m0 0l5-5m-5 5h11a5 5 0 010 10h-1" />
              </svg>
              Deshacer
            </button>
          )}
          {(activeShape.points.length > 0 || rectStart) && (
            <button
              onClick={handleReset}
              title="Borrar todos los puntos de esta forma y empezar de nuevo"
              className="flex items-center gap-1.5 bg-white/95 hover:bg-white text-gray-700 text-xs font-medium px-3 py-1.5 rounded-full shadow-lg border border-gray-200 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Resetear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
