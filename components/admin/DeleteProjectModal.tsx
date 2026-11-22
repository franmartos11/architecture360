'use client';

import { useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Dialog from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/ToastProvider';

interface DeleteProjectTarget {
  id: string;
  name: string;
}

// Confirmación reforzada para borrar un proyecto entero (a diferencia del
// resto de los borrados de la app, que usan el ConfirmProvider genérico
// con un solo click) — hay que escribir el nombre exacto, porque esto se
// lleva puesto TODO lo cargado (edificios, unidades, fotos, planos,
// tours, leads, piezas BIM) sin vuelta atrás. Se usa tanto desde "Mis
// proyectos" como desde "Configuración" del proyecto activo.
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
  // El último proyecto no nulo: al cerrar, el diálogo se anima con su
  // contenido en vez de quedar vacío.
  const [shown, setShown] = useState(project);
  if (project && project !== shown) setShown(project);
  const inputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleConfirm = async () => {
    if (!project || confirmText !== project.name) return;
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

  const target = project ?? shown;

  return (
    <Dialog
      open={!!project}
      onClose={handleClose}
      role="alertdialog"
      size="sm"
      dismissible={!deleting}
      title={target ? `¿Eliminar "${target.name}"?` : ''}
      description="Se eliminará todo lo cargado en este proyecto — edificios, unidades, fotos, planos, tours, leads, piezas BIM. Esta acción no se puede deshacer."
      // El foco empieza en el campo de confirmación, nunca en el botón que borra.
      initialFocus={inputRef}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={handleClose} disabled={deleting} className="bg-transparent hover:bg-gray-100">
            Cancelar
          </Button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={deleting || !target || confirmText !== target.name}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-medium px-4 py-2 transition-colors active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:hover:bg-red-600"
          >
            {deleting ? 'Eliminando...' : 'Eliminar proyecto'}
          </button>
        </>
      }
    >
      <label htmlFor="delete-project-confirm" className="block text-xs font-medium text-gray-500 mb-1.5">
        Para confirmar, escribí el nombre exacto del proyecto:
      </label>
      <input
        ref={inputRef}
        id="delete-project-confirm"
        type="text"
        value={confirmText}
        onChange={e => setConfirmText(e.target.value)}
        placeholder={target?.name}
        disabled={deleting}
        className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 outline-none disabled:opacity-50"
      />
    </Dialog>
  );
}
