'use client';

import { useState, useCallback, memo } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Room } from '@/types';

interface RoomPlanViewerProps {
  planImage: string;
  rooms: Room[];
  onSelectRoom?: (room: Room) => void;
  /** Ambiente a resaltar al entrar (ej. desde la lista de la sidebar). */
  focusRoomId?: string;
}

// Un ambiente sin polígono (cargado en el programa de la casa pero sin
// delimitar sobre el plano) no se dibuja acá — se ignora.
type DrawnRoom = Room & { polygon: NonNullable<Room['polygon']> };
const isDrawn = (r: Room): r is DrawnRoom => Array.isArray(r.polygon) && r.polygon.length >= 3;

export default function RoomPlanViewer({ planImage, rooms, onSelectRoom, focusRoomId }: RoomPlanViewerProps) {
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  const drawnRooms = rooms.filter(isDrawn);
  // El hover del usuario manda; si no hay, se resalta el ambiente pedido
  // desde afuera (ej. clickeado en la lista de la sidebar).
  const highlightId = hoveredRoom ?? focusRoomId ?? null;
  const hovered = drawnRooms.find(r => r.id === highlightId);
  const center = hovered
    ? {
        x: hovered.polygon.reduce((s, p) => s + p.x, 0) / hovered.polygon.length,
        y: hovered.polygon.reduce((s, p) => s + p.y, 0) / hovered.polygon.length,
      }
    : null;

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4">
      <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit wheel={{ step: 0.1 }} doubleClick={{ step: 1 }}>
        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }} contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* El overlay de polígonos tiene que coincidir EXACTO con la caja
              de la imagen renderizada. Los puntos se guardan como % del plano
              real (ver PolygonCanvas), así que la imagen se muestra a su
              proporción natural (nada de forzarla a un cuadrado con
              object-contain) y el <svg> la cubre 1:1. */}
          <div className="relative max-w-full max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={planImage}
              alt="Plano de ambientes"
              className="block max-w-full max-h-[85vh] w-auto h-auto select-none"
              draggable={false}
            />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {drawnRooms.map(room => (
                <RoomPolygon
                  key={room.id}
                  room={room}
                  isHovered={highlightId === room.id}
                  onHover={setHoveredRoom}
                  onSelect={onSelectRoom}
                />
              ))}
            </svg>
            {hovered && center && (
              <div
                className="absolute pointer-events-none z-10"
                style={{ left: `${center.x}%`, top: `${center.y}%`, transform: 'translate(-50%, -140%)' }}
              >
                <div className="bg-gray-900 text-white text-xs font-medium rounded-lg px-3 py-1.5 whitespace-nowrap shadow-lg">
                  {hovered.name}
                  <span className="text-white/50 ml-1.5">· click para ver la ficha</span>
                </div>
              </div>
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

function RoomPolygonBase({
  room, isHovered, onHover, onSelect,
}: {
  room: DrawnRoom;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onSelect?: (room: Room) => void;
}) {
  const points = room.polygon.map(p => `${p.x},${p.y}`).join(' ');

  const handleEnter = useCallback(() => onHover(room.id), [onHover, room.id]);
  const handleLeave = useCallback(() => onHover(null), [onHover]);
  const handleClick = useCallback(() => onSelect?.(room), [onSelect, room]);

  return (
    <polygon
      points={points}
      className={`room-polygon${isHovered ? ' room-polygon--active' : ''}`}
      vectorEffect="non-scaling-stroke"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`Ver ${room.name}`}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    />
  );
}

const RoomPolygon = memo(RoomPolygonBase);
