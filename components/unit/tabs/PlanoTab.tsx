'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { m as motion, AnimatePresence } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Unit, Room } from '@/types';
import RoomPlanViewer from '../RoomPlanViewer';

type PlanView = '3d' | '2d' | 'ambientes';

export default function PlanoTab({
  unit,
  hasRooms,
  planView,
  onPlanViewChange,
  onSelectRoom,
}: {
  unit: Unit;
  hasRooms: boolean;
  planView: PlanView;
  onPlanViewChange: (view: PlanView) => void;
  onSelectRoom: (room: Room) => void;
}) {
  // Casas de 2+ plantas: la planta baja vive en roomPlanImage/rooms, las de
  // más arriba en unit.levels — acá se unifican para poder elegir cuál
  // mostrar con el mismo selector.
  const levels = useMemo(() => [
    { label: 'Planta baja', planImage: unit.roomPlanImage || unit.technicalPlanUrl || '', rooms: unit.rooms ?? [] },
    ...(unit.levels ?? []).map(l => ({ label: l.label, planImage: l.planImage || '', rooms: l.rooms })),
  ], [unit.roomPlanImage, unit.technicalPlanUrl, unit.rooms, unit.levels]);
  const [activeLevelIdx, setActiveLevelIdx] = useState(0);
  const activeLevel = levels[activeLevelIdx] ?? levels[0];

  return (
    <motion.div
      key="plano"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex flex-col"
    >
      {/* Toggle bar */}
      <div className="flex-shrink-0 flex items-center justify-center gap-1 px-4 pt-3 pb-2">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-inner">
          {hasRooms && (
            <button
              onClick={() => onPlanViewChange('ambientes')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${planView === 'ambientes' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Ambientes
            </button>
          )}
          <button
            onClick={() => onPlanViewChange('3d')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${planView === '3d' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Plano 3D
          </button>
          <button
            onClick={() => onPlanViewChange('2d')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${planView === '2d' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Plano técnico
          </button>
        </div>
      </div>

      {/* Selector de planta — solo si hay más de una (casas de 2+ niveles) */}
      {planView === 'ambientes' && levels.length > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1 px-4 pb-2">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-inner">
            {levels.map((l, i) => (
              <button
                key={l.label}
                onClick={() => setActiveLevelIdx(i)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${activeLevelIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Plan image with zoom */}
      <div className="flex-1 relative overflow-hidden">
        {planView === 'ambientes' && hasRooms && activeLevel.planImage ? (
          <RoomPlanViewer
            planImage={activeLevel.planImage}
            rooms={activeLevel.rooms}
            onSelectRoom={onSelectRoom}
          />
        ) : planView === 'ambientes' && hasRooms ? (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            {activeLevel.label} sin plano cargado todavía.
          </div>
        ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={planView}
            initial={{ opacity: 0, x: planView === '3d' ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: planView === '3d' ? 20 : -20 }}
            transition={{ duration: 0.25 }}
            className="absolute inset-0 flex items-center justify-center p-2 sm:p-4"
          >
            {(unit.plan3dUrl || unit.technicalPlanUrl) && (
              <TransformWrapper
                key={planView}
                initialScale={1}
                minScale={0.5}
                maxScale={4}
                centerOnInit={true}
                wheel={{ step: 0.1 }}
                doubleClick={{ step: 1 }}
                panning={{ disabled: false }}
              >
                <TransformComponent
                  wrapperStyle={{ width: '100%', height: '100%' }}
                  contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                >
                  <Image
                    src={planView === '3d' ? (unit.plan3dUrl || unit.floorPlan3dUrl || '') : (unit.technicalPlanUrl || unit.plan3dUrl || '')}
                    alt={planView === '3d' ? 'Plano 3D' : 'Plano técnico'}
                    width={1200}
                    height={1200}
                    unoptimized={(planView === '2d' ? unit.technicalPlanUrl : unit.plan3dUrl)?.endsWith('.svg')}
                    className="max-w-full max-h-[80vh] object-contain"
                    draggable={false}
                  />
                </TransformComponent>
              </TransformWrapper>
            )}
          </motion.div>
        </AnimatePresence>
        )}
      </div>
    </motion.div>
  );
}
