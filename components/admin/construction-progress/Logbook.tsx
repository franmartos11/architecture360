'use client';

import Collapse from '@/components/ui/Collapse';
import { Pill } from '@/components/admin/panel-ui';
import EntryFields from './EntryFields';
import { hasMedia, monthTitle } from '@/lib/construction-progress-editor';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';

// Bitácora: las entradas de la más nueva a la más vieja. Cada una se
// resume en una línea con sus fotos; "Editar" la despliega en el lugar con
// los mismos campos que la carga rápida. El borrador se cambia desde la
// línea misma, sin abrirla: es lo que más se toca después de cargar.

export default function Logbook({ progress, today, open, onToggleOpen, onPatch, onSetDraft, onRemove, onNewEntry, viewOptions, onUploadingChange }: {
  progress: ConstructionProgress;
  today: string;
  open: Set<string>;
  onToggleOpen: (id: string) => void;
  onPatch: (id: string, patch: Partial<ConstructionUpdate>) => void;
  onSetDraft: (id: string, draft: boolean) => void;
  onRemove: (u: ConstructionUpdate) => void;
  onNewEntry: () => void;
  viewOptions: string[];
  onUploadingChange: (id: string, uploading: boolean) => void;
}) {
  const timeline = [...progress.updates].sort((a, b) => b.date.localeCompare(a.date));
  const hasThisMonth = progress.updates.some(u => u.date.slice(0, 7) === today.slice(0, 7));
  const stageName = (id?: string) => progress.stages.find(s => s.id === id)?.label;

  return (
    <section aria-label="Bitácora" className="flex flex-col gap-4">
      <h2 className="m-0 text-[15px] font-semibold text-gray-900">Bitácora</h2>
      <ol className="relative m-0 p-0 list-none flex flex-col gap-7 before:absolute before:left-[6px] before:top-2 before:bottom-2 before:w-px before:bg-gray-300">
        {!hasThisMonth && (
          <li className="relative pl-9 flex flex-col gap-3">
            <span aria-hidden className="absolute left-0 top-1.5 w-[13px] h-[13px] rounded-full border-2 border-dashed border-gray-500 bg-[#F5F3EE]" />
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-display text-lg font-semibold text-gray-900">{monthTitle(today)}</span>
              <Pill tone="warn">Falta la de este mes</Pill>
            </div>
            <button type="button" onClick={onNewEntry}
              className="w-[124px] h-[92px] rounded-xl border border-dashed border-gray-300 bg-white/50 text-xs text-gray-700 hover:border-gray-400">
              + Fotos
            </button>
          </li>
        )}
        {timeline.length === 0 && hasThisMonth && (
          <li className="pl-9 text-sm text-gray-500">Todavía no cargaste ninguna entrada.</li>
        )}
        {timeline.map(u => {
          const isOpen = open.has(u.id);
          const stage = stageName(u.stageId);
          const media = hasMedia(u);
          return (
            <li key={u.id} className="relative pl-9 flex flex-col gap-3">
              <span aria-hidden className={`absolute left-0 top-1.5 w-[13px] h-[13px] rounded-full ${u.draft ? 'border-2 border-dashed border-gray-500 bg-[#F5F3EE]' : 'bg-brand-700'}`} />
              <div className="flex items-start justify-between gap-x-3 gap-y-2 flex-wrap">
                <button type="button" onClick={() => onToggleOpen(u.id)} aria-expanded={isOpen} aria-controls={`obra-${u.id}`}
                  className="flex-[1_1_260px] min-w-0 flex items-center gap-x-3 gap-y-1 flex-wrap text-left min-h-[32px]">
                  <span className="font-display text-lg font-semibold text-gray-900">{monthTitle(u.date)}</span>
                  {stage && <Pill tone="green">{stage}</Pill>}
                  {u.draft && <Pill>Borrador</Pill>}
                  {!u.draft && !media && <Pill tone="warn">Sin fotos no se ve</Pill>}
                  <span className="text-[13px] text-gray-700">{u.title || 'Sin título'}</span>
                  <span className="text-xs text-gray-500 underline underline-offset-2">{isOpen ? 'Cerrar' : 'Editar'}</span>
                </button>
                <button type="button" onClick={() => onSetDraft(u.id, !u.draft)}
                  className="shrink-0 min-h-[36px] px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-900 hover:border-gray-400">
                  {u.draft ? 'Publicar' : 'Pasar a borrador'}
                </button>
              </div>
              {media && !isOpen && (
                <div className="flex gap-2 flex-wrap">
                  {u.images.slice(0, 6).map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element -- miniatura del admin
                    <img key={i} src={src} alt="" className="w-[124px] h-[92px] rounded-xl object-cover border border-gray-200" />
                  ))}
                  {u.images.length > 6 && <span className="w-[124px] h-[92px] rounded-xl bg-gray-100 flex items-center justify-center text-sm text-gray-600">+{u.images.length - 6}</span>}
                  {u.images.length === 0 && u.video && (
                    <span className="w-[124px] h-[92px] rounded-xl bg-gray-900 text-white flex items-center justify-center text-xs font-semibold">Clip</span>
                  )}
                </div>
              )}
              <Collapse open={isOpen}>
                <div id={`obra-${u.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 flex flex-col gap-4">
                  <EntryFields
                    entry={u}
                    onChange={patch => onPatch(u.id, patch)}
                    stages={progress.stages}
                    viewOptions={viewOptions}
                    onUploadingChange={v => onUploadingChange(u.id, v)}
                  />
                  <div className="flex justify-end">
                    <button type="button" onClick={() => onRemove(u)} className="min-h-[40px] px-3 rounded-lg text-[13px] font-medium text-red-700 hover:bg-red-50">Borrar entrada</button>
                  </div>
                </div>
              </Collapse>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
