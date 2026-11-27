'use client';

import { useState, useMemo } from 'react';
import Image from 'next/image';
import { m as motion } from 'framer-motion';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { PLAN_WHEEL, PLAN_DOUBLE_CLICK, PLAN_CONTENT_STYLE } from '@/lib/plan-zoom';
import type { Unit, BimModel } from '@/types';
import BimUnifiedViewer from '@/components/bim/BimUnifiedViewer';
import { useLocale, useT } from '@/lib/i18n/client';
import { etiquetaPiso } from '@/lib/i18n/catalogo';

type ViewMode = 'render' | 'bim-3d' | 'bim-gallery';

export default function Planta3DTab({ unit, bimModel }: { unit: Unit; bimModel?: BimModel }) {
  // Planta baja (unit.floorPlan3dUrl) + plantas de más (unit.levels[].plan3dImage).
  const t = useT();
  const { locale } = useLocale();
  const plantaBaja = t('unidad.plantaBaja');
  const levels = useMemo(
    () =>
      [
        { label: plantaBaja, image: unit.floorPlan3dUrl || '' },
        ...(unit.levels ?? []).map(l => ({ label: etiquetaPiso(l.label, locale), image: l.plan3dImage || '' })),
      ].filter(l => l.image),
    [plantaBaja, locale, unit.floorPlan3dUrl, unit.levels],
  );

  const hasRender = levels.length > 0;
  const hasBim3D = !!bimModel?.geometryUrl;
  const hasBimGallery = (bimModel?.galleryImages?.length ?? 0) > 0;
  const hasBim = hasBim3D || hasBimGallery;

  const [chosenMode, setViewMode] = useState<ViewMode>(
    hasRender ? 'render' : (hasBim3D ? 'bim-3d' : 'bim-gallery')
  );
  // Si lo elegido ya no existe (ej. la unidad dejó de tener renders), se
  // muestra lo que haya — derivado en el render, sin efecto que lo corrija.
  const viewMode: ViewMode = chosenMode === 'render' && !hasRender ? (hasBim3D ? 'bim-3d' : 'bim-gallery') : chosenMode;
  const [activeIdx, setActiveIdx] = useState(0);
  const active = levels[activeIdx] ?? levels[0];
  const isRender = viewMode === 'render';
  const isBim = viewMode === 'bim-3d' || viewMode === 'bim-gallery';


  return (
    <motion.div
      key="planta3d"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 pt-3 md:pt-16 flex flex-col"
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
                {t('unidad.planta3d.estatica')}
              </button>
            )}
            {hasBim3D && (
              <button
                onClick={() => setViewMode('bim-3d')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${viewMode === 'bim-3d' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {t('unidad.planta3d.bim')}
              </button>
            )}
            {hasBimGallery && (
              <button
                onClick={() => setViewMode('bim-gallery')}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${viewMode === 'bim-gallery' ? 'bg-white text-gray-900 shadow' : 'text-gray-400 hover:text-gray-600'}`}
              >
                {t('unidad.planta3d.imagenes')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Selector de pisos (si hay múltiples plantas estáticas y estamos en render) */}
      {isRender && levels.length > 1 && (
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
        {isBim && bimModel && (
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

        {isRender && !active && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
            {t('unidad.planta3d.sinPlanta')}
          </div>
        )}

        {isRender && active && (
          <div className="absolute inset-0 p-2 sm:p-4 bg-gray-50/50">
            <TransformWrapper
              key={activeIdx}
              initialScale={1}
              minScale={1}
              maxScale={4}
              centerOnInit={true}
              centerZoomedOut={true}
              wheel={PLAN_WHEEL}
              doubleClick={PLAN_DOUBLE_CLICK}
              panning={{ disabled: false }}
            >
              {() => (
              <>
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={PLAN_CONTENT_STYLE}
              >
                <Image
                  src={active.image}
                  alt={levels.length > 1 ? t('unidad.planta3d.altNivel', { planta: active.label }) : t('unidad.tab.planta3d')}
                  width={1200}
                  height={1200}
                  priority
                  className="max-w-[100cqw] max-h-[100cqh] object-contain drop-shadow-xl"
                  draggable={false}
                />
              </TransformComponent>
              </>
              )}
            </TransformWrapper>
          </div>
        )}
      </div>
    </motion.div>
  );
}
