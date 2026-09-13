'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import Button from '@/components/ui/Button';
import type { FloorRow } from '@/types/database';

// Modal de un único ImageUploader para el plano de un piso — reemplaza
// tener un ImageUploader completo (drag&drop, preview, estado de subida)
// montado permanentemente en cada fila de la lista de pisos.
export default function FloorPlanModal({
  floor, onClose, onSave,
}: {
  floor: Pick<FloorRow, 'id' | 'label' | 'plan_image'>;
  onClose: () => void;
  onSave: (url: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Plano de {floor.label}</h3>
        </div>
        <div className="p-6 space-y-4">
          <ImageUploader
            value={floor.plan_image ?? ''}
            onChange={onSave}
            folder="floorplans"
          />
          <Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cerrar</Button>
        </div>
      </div>
    </div>
  );
}
