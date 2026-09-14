'use client';

import { useState, useEffect } from 'react';
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
  const [deleteBim, setDeleteBim] = useState(false);
  const [bimCount, setBimCount] = useState<{ projectId: string; own: number; other: number } | null>(null);
  const toast = useToast();

  // Los conteos se piden acá y no en las dos pantallas que abren el modal:
  // ambas son Client Components que ya traen sus datos por fetch, así que
  // cargarlo en cada una sería el mismo request duplicado. El resultado
  // se guarda junto con el id de proyecto al que corresponde (en vez de
  // resetear el estado a mano al cerrar/cambiar de proyecto) para no
  // llamar a setState sincrónicamente en el cuerpo del efecto.
  useEffect(() => {
    if (!project) return;
    let cancelled = false;
    fetch(`/api/admin/projects/${project.id}/bim-count`)
      .then(res => (res.ok ? res.json() : null))
      .then(data => { if (!cancelled && data) setBimCount({ projectId: project.id, ...data }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [project]);

  if (!project) return null;

  const counts = bimCount?.projectId === project.id ? bimCount : null;

  const handleConfirm = async () => {
    if (confirmText !== project.name) return;
    setDeleting(true);
    const res = await fetch(`/api/admin/projects/${project.id}?deleteBim=${deleteBim}`, { method: 'DELETE' });
    setDeleting(false);
    if (res.ok) {
      toast('Proyecto eliminado.');
      setConfirmText('');
      setDeleteBim(false);
      onDeleted();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al eliminar el proyecto.', 'error');
    }
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    setDeleteBim(false);
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
        {counts && counts.own > 0 && (
          <div className="mt-4 rounded-xl border border-gray-200 p-3.5">
            <p className="text-sm font-medium text-gray-900 mb-2">
              Este proyecto tiene {counts.own}{' '}
              {counts.own === 1 ? 'modelo BIM asociado' : 'modelos BIM asociados'}.
            </p>
            <label className="flex items-start gap-2.5 text-sm text-gray-700 mb-1.5">
              <input
                type="radio" name="bim-action" checked={!deleteBim}
                onChange={() => setDeleteBim(false)} disabled={deleting}
                className="mt-0.5"
              />
              <span>Conservarlos en mi portfolio <span className="text-gray-400">(recomendado)</span></span>
            </label>
            <label className="flex items-start gap-2.5 text-sm text-gray-700">
              <input
                type="radio" name="bim-action" checked={deleteBim}
                onChange={() => setDeleteBim(true)} disabled={deleting}
                className="mt-0.5"
              />
              <span>Eliminarlos también</span>
            </label>
            {counts.other > 0 && (
              <p className="text-xs text-gray-500 mt-2.5">
                {counts.other === 1
                  ? '1 modelo de otro colaborador se desvinculará, no se elimina.'
                  : `${counts.other} modelos de otros colaboradores se desvincularán, no se eliminan.`}
              </p>
            )}
          </div>
        )}
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
