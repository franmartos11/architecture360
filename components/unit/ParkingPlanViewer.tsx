'use client';

import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { UnitParkingSpot } from '@/types';

// Plano del piso de cocheras con el/los espacio(s) de ESTE depto resaltados.
// Mismo enfoque que RoomPlanViewer: la imagen se muestra a su proporción
// natural (los polígonos se guardan como % del plano real) y el <svg> la
// cubre 1:1. A diferencia de los ambientes, acá no hay hover ni click: es
// un "dónde está tu cochera", no un navegador.
export default function ParkingPlanViewer({
  planImage,
  spots,
}: {
  planImage: string;
  spots: UnitParkingSpot[];
}) {
  const drawn = spots.filter(s => s.polygon?.length >= 3);

  return (
    <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4">
      <TransformWrapper initialScale={1} minScale={0.5} maxScale={4} centerOnInit centerZoomedOut wheel={{ step: 0.1 }} doubleClick={{ step: 1 }}>
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
        >
          <div className="relative max-w-full max-h-[85vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={planImage}
              alt="Plano de cocheras"
              className="block max-w-full max-h-[85vh] w-auto h-auto select-none"
              draggable={false}
            />
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
              {drawn.map((spot, i) => (
                <polygon
                  key={i}
                  points={spot.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="rgba(217, 119, 6, 0.4)"
                  stroke="#d97706"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
            {drawn.map((spot, i) => {
              const center = {
                x: spot.polygon.reduce((s, p) => s + p.x, 0) / spot.polygon.length,
                y: spot.polygon.reduce((s, p) => s + p.y, 0) / spot.polygon.length,
              };
              return (
                <div
                  key={i}
                  className="absolute pointer-events-none z-10"
                  style={{ left: `${center.x}%`, top: `${center.y}%`, transform: 'translate(-50%, -50%)' }}
                >
                  <span className="bg-gray-900 text-white text-[11px] font-semibold rounded-md px-2 py-0.5 whitespace-nowrap shadow-lg">
                    {spot.label || 'Tu cochera'}
                  </span>
                </div>
              );
            })}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}
