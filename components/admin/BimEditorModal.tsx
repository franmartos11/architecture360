'use client';

import BimEditor from '@/components/admin/section-editors/BimEditor';
import Dialog from '@/components/ui/Dialog';

export default function BimEditorModal({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title="Gestor de Modelos BIM"
      description="Podés subir, editar y enlazar modelos 3D interactivos a pisos o unidades."
    >
      <BimEditor />
    </Dialog>
  );
}
