'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import Dialog from '@/components/ui/Dialog';
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
    <Dialog
      open
      onClose={onClose}
      title={`Plano de ${floor.label}`}
      footer={<Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cerrar</Button>}
    >
      <ImageUploader
        value={floor.plan_image ?? ''}
        onChange={onSave}
        folder="floorplans"
      />
    </Dialog>
  );
}
