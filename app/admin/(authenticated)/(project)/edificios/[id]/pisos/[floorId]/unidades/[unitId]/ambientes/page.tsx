'use client';

import { use, useState } from 'react';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import ImagenesGroup from '@/components/admin/unit-groups/ImagenesGroup';
import { useUnitShell } from '../unit-shell-context';

export default function UnitAmbientesPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  const { values, patch } = useUnitShell();
  const [photosOpen, setPhotosOpen] = useState(
    () => Boolean(values.interiorImageUrl || (values.galleryImages?.length ?? 0) > 0)
  );

  const galleryCount = values.galleryImages?.length ?? 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-gray-50/70">
        <button
          type="button"
          onClick={() => setPhotosOpen(o => !o)}
          className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left"
        >
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-gray-900">Foto de portada y galería general</p>
            <p className="m-0 text-xs text-gray-500 mt-0.5">
              {values.interiorImageUrl ? 'Con portada' : 'Sin portada'} · {galleryCount === 1 ? '1 foto en galería' : `${galleryCount} fotos en galería`}
            </p>
          </div>
          <span className="text-xs font-medium text-gray-700 shrink-0">
            {photosOpen ? 'Ocultar' : 'Cargar / editar'}
          </span>
        </button>
        {photosOpen && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-200 bg-white rounded-b-xl">
            <ImagenesGroup values={values} onChange={patch} />
          </div>
        )}
      </div>

      <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={unitId} />
    </div>
  );
}
