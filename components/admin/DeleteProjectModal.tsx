'use client';

import { useState } from 'react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';

interface DeleteProjectTarget {
  id: string;
  name: string;
}

// Confirmación reforzada para borrar un proyecto entero (a diferencia del
// resto de los borrados de la app, que usan el ConfirmProvider genérico
// con un solo click) — hay que escribir el nombre exacto, porque esto se
// lleva puesto TODO lo cargado (edificios, unidades, fotos, planos,
// tours, leads) sin vuelta atrás. Se usa tanto desde "Mis proyectos"
// como desde "Configuración" del proyecto activo.
export default function DeleteProjectModal({
  project,
  onClose,
  onDeleted,
}: {
  project: DeleteProjectTarget | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  if (!project) return null;

  const handleConfirm = async () => {
    if (confirmText !== project.name) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) {
      toast('Proyecto eliminado.');
      setConfirmText('');
      onDeleted();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al eliminar el proyecto.', 'error');
    }
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[300] p-4" onClick={handleClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
      >
        <h3 className="text-lg font-semibold text-gray-900 mb-1.5">¿Eliminar &quot;{project.name}&quot;?</h3>
        <p className="text-sm text-gray-600">
          Se eliminará todo lo cargado en este proyecto — edificios, unidades, fotos, planos, tours, leads. Esta acción no se puede deshacer.
        </p>
        <label className="block text-xs font-medium text-gray-500 mt-4 mb-1.5">
          Para confirmar, escribí el nombre exacto del proyecto:
        </label>
        <input
          type="text"
          value={confirmText}
          onChange={e => setConfirmText(e.target.value)}
          placeholder={project.name}
          autoFocus
          disabled={deleting}
          className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none disabled:opacity-50"
        />
        <div className="flex items-center gap-3 mt-5 justify-end">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={deleting} className="bg-transparent hover:bg-gray-100">
            Cancelar
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting || confirmText !== project.name}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2 transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
          >
            {deleting ? 'Eliminando...' : 'Eliminar proyecto'}
          </button>
        </div>
      </div>
    </div>
  );
}
