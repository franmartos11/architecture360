'use client';

import { useState, useCallback, memo } from 'react';
import Image from 'next/image';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Room } from '@/types';

interface RoomPlanViewerProps {
  planImage: string;
  rooms: Room[];
  onSelectRoom?: (room: Room) => void;
}

export default function RoomPlanViewer({ planImage, rooms, onSelectRoom }: RoomPlanViewerProps) {
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  const hovered = rooms.find(r => r.id === hoveredRoom);
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
          <div className="relative max-w-full max-h-[85vh]">
            <Image
              src={planImage}
              alt="Plano de ambientes"
              width={1200}
              height={1200}
              unoptimized={planImage.endsWith('.svg')}
              className="max-w-full max-h-[85vh] object-contain select-none"
              draggable={false}
            />
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {rooms.map(room => (
                <RoomPolygon
                  key={room.id}
                  room={room}
                  isHovered={hoveredRoom === room.id}
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
                  {hovered.tourNodeId && <span className="text-white/50 ml-1.5">· click para recorrer</span>}
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
  room: Room;
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
      className="room-polygon"
      fillOpacity={isHovered ? 0.55 : undefined}
      strokeWidth={isHovered ? 2.5 : 1.5}
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
