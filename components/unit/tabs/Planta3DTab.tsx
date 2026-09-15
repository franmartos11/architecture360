'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { m as motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Unit, BimModel } from '@/types';
import BimUnifiedViewer from '@/components/bim/BimUnifiedViewer';

export default function Planta3DTab({ unit, bimModel }: { unit: Unit; bimModel?: BimModel }) {
  // Planta baja (unit.floorPlan3dUrl) + plantas de más (unit.levels[].plan3dImage).
  const levels = useMemo(
    () =>
      [
        { label: 'Planta baja', image: unit.floorPlan3dUrl || '' },
        ...(unit.levels ?? []).map(l => ({ label: l.label, image: l.plan3dImage || '' })),
      ].filter(l => l.image),
    [unit.floorPlan3dUrl, unit.levels],
  );

  const hasRender = levels.length > 0;
  const hasBim = !!bimModel && (!!bimModel.geometryUrl || bimModel.galleryImages.length > 0);

  const [viewMode, setViewMode] = useState<'render' | 'bim'>(hasRender ? 'render' : 'bim');
  const [activeIdx, setActiveIdx] = useState(0);
  const active = levels[activeIdx] ?? levels[0];

  // Si cambia el hasRender o hasBim y estamos en un estado inválido
  useEffect(() => {
    if (viewMode === 'render' && !hasRender && hasBim) setViewMode('bim');
    if (viewMode === 'bim' && !hasBim && hasRender) setViewMode('render');
  }, [hasRender, hasBim, viewMode]);

  return (
    <motion.div
      key="planta3d"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex flex-col"
    >
      {/* Selector superior: toggle Render/BIM y selector de pisos */}
      {(hasRender && hasBim || (viewMode === 'render' && levels.length > 1)) && (
        <div className="flex-shrink-0 flex flex-col sm:flex-row items-center justify-center gap-2 px-4 pt-3 pb-2 relative z-10">
          {hasRender && hasBim && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-inner">
              <button
                onClick={() => setViewMode('render')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${viewMode === 'render' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Render 3D
              </button>
              <button
                onClick={() => setViewMode('bim')}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${viewMode === 'bim' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Modelo BIM
              </button>
            </div>
          )}

          {viewMode === 'render' && levels.length > 1 && (
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-inner">
              {levels.map((l, i) => (
                <button
                  key={l.label}
                  onClick={() => setActiveIdx(i)}
                  className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all duration-200 ${activeIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 relative p-2 sm:p-4">
        {viewMode === 'bim' && bimModel && (
          <div className="absolute inset-0 bg-gray-900 rounded-xl overflow-hidden shadow-inner">
            <BimUnifiedViewer
              geometryUrl={bimModel.geometryUrl}
              coverImage={bimModel.coverImage}
              galleryImages={bimModel.galleryImages}
              title={bimModel.title}
            />
          </div>
        )}

        {viewMode === 'render' && !active && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Todavía no hay planta 3D cargada para esta unidad.
          </div>
        )}

        {viewMode === 'render' && active && (
          <TransformWrapper
            key={activeIdx}
            initialScale={1}
            minScale={1}
            maxScale={4}
            centerOnInit={true}
            centerZoomedOut={true}
            wheel={{ step: 0.1 }}
            doubleClick={{ step: 1 }}
            panning={{ disabled: false }}
          >
            <TransformComponent
              wrapperStyle={{ width: '100%', height: '100%' }}
              contentStyle={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            >
              <Image
                src={active.image}
                alt={levels.length > 1 ? `Planta 3D — ${active.label}` : 'Planta 3D'}
                width={1200}
                height={1200}
                priority
                className="max-w-full max-h-[85vh] object-contain"
                draggable={false}
              />
            </TransformComponent>
          </TransformWrapper>
        )}
      </div>
    </motion.div>
  );
}
