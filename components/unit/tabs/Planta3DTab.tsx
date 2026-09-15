'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import { m as motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { Unit, BimModel } from '@/types';
import BimUnifiedViewer from '@/components/bim/BimUnifiedViewer';

type ViewMode = 'render' | 'bim-3d' | 'bim-gallery';

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
  const hasBim3D = !!bimModel?.geometryUrl;
  const hasBimGallery = (bimModel?.galleryImages?.length ?? 0) > 0;
  const hasBim = hasBim3D || hasBimGallery;

  const [viewMode, setViewMode] = useState<ViewMode>(
    hasRender ? 'render' : (hasBim3D ? 'bim-3d' : 'bim-gallery')
  );
  const [activeIdx, setActiveIdx] = useState(0);
  const active = levels[activeIdx] ?? levels[0];

  // Si el estado queda inválido
  useEffect(() => {
    if (viewMode === 'render' && !hasRender) {
      setViewMode(hasBim3D ? 'bim-3d' : 'bim-gallery');
    }
  }, [hasRender, hasBim3D, viewMode]);

  return (
    <motion.div
      key="planta3d"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-16 flex flex-col"
    >
      {/* Selector superior central (estilo idéntico a PlanoTab) */}
      {(hasRender && hasBim) && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1 px-4 pt-3 pb-2 z-30">
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 shadow-inner">
            {hasRender && (
              <button
                onClick={() => setViewMode('render')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${viewMode === 'render' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Planta Estática
              </button>
            )}
            {hasBim3D && (
              <button
                onClick={() => setViewMode('bim-3d')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${viewMode === 'bim-3d' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Modelo BIM
              </button>
            )}
            {hasBimGallery && (
              <button
                onClick={() => setViewMode('bim-gallery')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${viewMode === 'bim-gallery' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Imágenes
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selector de pisos (si hay múltiples plantas estáticas y estamos en render) */}
      {viewMode === 'render' && levels.length > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-1 px-4 pb-2 z-20">
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
        </div>
      )}

      <div className="flex-1 relative bg-white">
        {(viewMode === 'bim-3d' || viewMode === 'bim-gallery') && bimModel && (
          <div className="absolute inset-0 bg-white">
            <BimUnifiedViewer
              geometryUrl={bimModel.geometryUrl}
              coverImage={bimModel.coverImage}
              galleryImages={bimModel.galleryImages}
              title={bimModel.title}
              controlledMode={viewMode === 'bim-3d' ? '3d' : 'gallery'}
            />
          </div>
        )}

        {viewMode === 'render' && !active && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            Todavía no hay planta 3D cargada para esta unidad.
          </div>
        )}

        {viewMode === 'render' && active && (
          <div className="absolute inset-0 p-2 sm:p-4 bg-gray-50/50">
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
                  className="max-w-full max-h-[85vh] object-contain drop-shadow-xl"
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          </div>
        )}
      </div>
    </motion.div>
  );
}
