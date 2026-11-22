'use client';

import { useState } from 'react';
import Dialog from '@/components/ui/Dialog';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { btnPrimary, btnSecondary } from '@/components/admin/panel-ui';
import EntryFields from './EntryFields';
import ConflictNotice from './ConflictNotice';
import { blankEntry, entryReadiness, hasMedia, monthTitle } from '@/lib/construction-progress-editor';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';

// Carga rápida de una entrada: lo que se usa parado en la obra con el
// celular. En pantallas angostas es una hoja desde abajo (Dialog
// variant="sheet"). Se monta de nuevo cada vez que se abre (el padre le
// cambia la `key`), así arranca en blanco sin tener que resetear estado en
// un efecto.
//
// La entrada vive acá, aparte del avance: si el guardado choca con otra
// persona (409) y hay que recargar, lo que se descarta es el avance local,
// no la entrada que se estaba cargando — se vuelve a apretar "Publicar" y
// se suma sobre lo recién recargado.

export default function QuickEntryDialog({ open, onClose, progress, today, viewOptions, onSubmit, conflict, onReload, reloading }: {
  open: boolean;
  onClose: () => void;
  progress: ConstructionProgress;
  today: string;
  viewOptions: string[];
  /** Suma la entrada y guarda. true si quedó guardada (el diálogo se cierra). */
  onSubmit: (entry: ConstructionUpdate, draft: boolean) => Promise<boolean>;
  /** Mensaje del 409, si el último guardado chocó. */
  conflict: string | null;
  onReload: () => void;
  reloading: boolean;
}) {
  const [entry, setEntry] = useState<ConstructionUpdate>(() => blankEntry(progress, today));
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState<'draft' | 'publish' | null>(null);
  const confirm = useConfirm();
  const { canDraft, canPublish, hint } = entryReadiness(entry);
  const busy = uploading || submitting != null || reloading;

  const touched = hasMedia(entry) || entry.title.trim() !== '' || !!entry.body;
  const requestClose = async () => {
    if (submitting) return;
    if (touched) {
      const ok = await confirm({
        title: 'Descartar la entrada',
        message: 'Lo que cargaste en esta entrada no se guarda.',
        confirmLabel: 'Descartar',
        danger: true,
      });
      if (!ok) return;
    }
    onClose();
  };

  const submit = async (draft: boolean) => {
    setSubmitting(draft ? 'draft' : 'publish');
    const ok = await onSubmit(entry, draft);
    setSubmitting(null);
    if (ok) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      variant="sheet"
      size="lg"
      title={`Nueva entrada · ${monthTitle(entry.date || today)}`}
      description="Fotos primero. Lo demás ya viene completo y se puede cambiar después."
      footer={
        <div className="w-full flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          {hint && <p className="m-0 text-xs text-gray-600 sm:mr-auto">{hint}</p>}
          {uploading && <p className="m-0 text-xs text-gray-600 sm:mr-auto" role="status">Esperando que terminen de subir…</p>}
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={() => submit(true)} disabled={busy || !canDraft || conflict != null} className={btnSecondary}>
              {submitting === 'draft' ? 'Guardando…' : 'Guardar como borrador'}
            </button>
            <button type="button" onClick={() => submit(false)} disabled={busy || !canPublish || conflict != null} className={btnPrimary}>
              {submitting === 'publish' ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {conflict && (
          <ConflictNotice message={conflict} onReload={onReload} reloading={reloading}
            detail="Tu entrada no se pierde: recargá y volvé a apretar Publicar." />
        )}
        <EntryFields
          entry={entry}
          onChange={patch => setEntry(e => ({ ...e, ...patch }))}
          stages={progress.stages}
          viewOptions={viewOptions}
          onUploadingChange={setUploading}
        />
      </div>
    </Dialog>
  );
}
