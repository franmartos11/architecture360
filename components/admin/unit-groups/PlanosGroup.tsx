'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import type { UnitGroupProps } from '@/lib/unit-fields';

export default function PlanosGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
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
    </div>
  );
}
