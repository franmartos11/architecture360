'use client';

import { useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import BimEditorModal from '@/components/admin/BimEditorModal';
import { UNIT_PLAN_FIELDS, type UnitGroupProps } from '@/lib/unit-fields';

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
      {UNIT_PLAN_FIELDS.map(f => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <p className="text-[11.5px] font-medium text-gray-900">{f.label}</p>
          <ImageUploader value={values[f.key] ?? ''} onChange={url => onChange({ [f.key]: url || null })} folder="floorplans" />
          <p className="text-[10.5px] text-gray-400">{f.hint}</p>
        </div>
      ))}

      {bimModalOpen && (
        <BimEditorModal onClose={() => setBimModalOpen(false)} />
      )}
    </div>
  );
}
