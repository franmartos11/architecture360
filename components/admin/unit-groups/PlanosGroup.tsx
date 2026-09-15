'use client';

import { useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import BimEditorModal from '@/components/admin/BimEditorModal';
import type { UnitGroupProps } from '@/lib/unit-fields';

export default function PlanosGroup({ values, onChange }: UnitGroupProps) {
  const [bimModalOpen, setBimModalOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Modelo 3D interactivo (BIM)</p>
        <button
          type="button"
          onClick={() => setBimModalOpen(true)}
          className="h-10 w-full rounded-lg border border-gray-200 text-xs font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 flex items-center justify-center gap-2 transition-colors"
        >
          Gestionar BIM 3D
        </button>
      </div>
      <hr className="border-gray-100" />
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Plano 3D (planta)</p>
        <ImageUploader value={values.floorPlan3dUrl ?? ''} onChange={url => onChange({ floorPlan3dUrl: url || null })} folder="floorplans" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Render 3D</p>
        <ImageUploader value={values.plan3dUrl ?? ''} onChange={url => onChange({ plan3dUrl: url || null })} folder="floorplans" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Plano técnico</p>
        <ImageUploader value={values.technicalPlanUrl ?? ''} onChange={url => onChange({ technicalPlanUrl: url || null })} folder="floorplans" />
      </div>

      {bimModalOpen && (
        <BimEditorModal onClose={() => setBimModalOpen(false)} />
      )}
    </div>
  );
}
