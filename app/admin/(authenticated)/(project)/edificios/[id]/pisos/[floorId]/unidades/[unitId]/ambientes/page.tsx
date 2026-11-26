'use client';

import { use, useState } from 'react';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import ImagenesGroup from '@/components/admin/unit-groups/ImagenesGroup';
import PlanosGroup from '@/components/admin/unit-groups/PlanosGroup';
import TourEditor from '@/components/admin/TourEditor';
import { useUnitShell } from '../unit-shell-context';
import type { TourData } from '@/types';

type VisualTab = 'ambientes' | 'portada' | 'planos' | 'tour';

export default function UnitAmbientesPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  const { unit, values, patch } = useUnitShell();
  const [tab, setTab] = useState<VisualTab>('ambientes');
  const [liveTourData, setLiveTourData] = useState<TourData | null>(values.tourData);
  const [tourKey, setTourKey] = useState(0);

  const photoCount = (values.interiorImageUrl ? 1 : 0) + (values.galleryImages?.length ?? 0);
  const planCount = [values.floorPlan3dUrl, values.plan3dUrl, values.technicalPlanUrl].filter(Boolean).length;
  const nodeCount = liveTourData?.nodes?.length ?? 0;

  const tabs: { id: VisualTab; label: string; count?: number }[] = [
    { id: 'ambientes', label: 'Ambientes y 360°', count: unit.rooms?.length ?? 0 },
    { id: 'portada', label: 'Portada y galería', count: photoCount },
    { id: 'planos', label: 'Planos 2D/3D', count: planCount },
    { id: 'tour', label: 'Hotspots 360°', count: nodeCount },
  ];

  const handleTourDataFromRooms = (td: TourData | null) => {
    setLiveTourData(td);
    setTourKey(k => k + 1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-1.5 p-1 bg-gray-100 rounded-xl w-fit" role="tablist" aria-label="Vistas visuales de la unidad">
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 ${
                active ? 'bg-white text-gray-900 shadow-sm font-semibold' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>{t.label}</span>
              {(t.count ?? 0) > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${active ? 'bg-gray-900 text-white' : 'bg-gray-200/80 text-gray-700'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'ambientes' && (
        <UnitRoomsEditor
          buildingId={buildingId}
          floorId={floorId}
          unitId={unitId}
          onOpenTourEditor={() => setTab('tour')}
          onTourDataUpdated={handleTourDataFromRooms}
        />
      )}

      {tab === 'portada' && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Foto principal de la tarjeta y galería general de la unidad (las fotos por ambiente se suman solas en el sitio).
          </p>
          <ImagenesGroup values={values} onChange={patch} />
        </div>
      )}

      {tab === 'planos' && (
        <PlanosGroup values={values} onChange={patch} unitId={unit.id} />
      )}

      {tab === 'tour' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500 leading-relaxed">
            Conectá con flechas las panorámicas 360° que cargaste en cada ambiente y elegí la escena de inicio.
          </p>
          <TourEditor
            key={tourKey}
            initialTourData={liveTourData}
            onPersist={async next => {
              setLiveTourData(next);
              return patch({ tourData: next });
            }}
          />
        </div>
      )}
    </div>
  );
}
