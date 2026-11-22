'use client';

import { useRef } from 'react';
import { fieldClass } from '@/components/admin/panel-ui';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import VideoUploader from '@/components/admin/VideoUploader';
import { MAX_IMAGES_PER_UPDATE } from '@/lib/construction-progress';
import type { ConstructionStage, ConstructionUpdate } from '@/types';

// Los campos de una entrada de la bitácora. Los usan la carga rápida (el
// diálogo de "+ Nueva entrada") y la edición en el lugar de una entrada ya
// cargada, para que las dos se vean y se comporten igual.
//
// Orden pensado para el celular en la obra: las FOTOS primero (es a lo que
// se viene), después lo que ya trae un valor por defecto (fecha, etapa) y
// al final lo opcional.

export default function EntryFields({ entry, onChange, stages, viewOptions, onUploadingChange }: {
  entry: ConstructionUpdate;
  onChange: (patch: Partial<ConstructionUpdate>) => void;
  stages: ConstructionStage[];
  /** Ángulos para sugerir (los ya usados primero). */
  viewOptions: string[];
  /** true mientras sube una foto o el clip — para no dejar guardar a medias. */
  onUploadingChange?: (uploading: boolean) => void;
}) {
  // Fotos y clip suben por separado: se avisa "subiendo" mientras cualquiera
  // de los dos siga. Ref y no estado porque solo se lee al avisar.
  const busy = useRef({ photos: false, video: false });
  const report = (key: 'photos' | 'video', value: boolean) => {
    busy.current[key] = value;
    onUploadingChange?.(busy.current.photos || busy.current.video);
  };
  const id = (name: string) => `obra-${entry.id}-${name}`;

  return (
    <div className="flex flex-col gap-4">
      <MultiImageUploader
        label={`Fotos · la primera es la portada (hasta ${MAX_IMAGES_PER_UPDATE})`}
        values={entry.images}
        onChange={images => onChange({ images: images.slice(0, MAX_IMAGES_PER_UPDATE) })}
        folder="construction"
        variant="grid"
        cameraButtons
        compress
        max={MAX_IMAGES_PER_UPDATE}
        onUploadingChange={v => report('photos', v)}
      />

      <div className="grid gap-4 grid-cols-2">
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-medium text-gray-700">Fecha</span>
          <input type="date" value={entry.date} required
            onChange={e => e.target.value && onChange({ date: e.target.value })} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1.5 min-w-0">
          <span className="text-xs font-medium text-gray-700">Etapa</span>
          <select value={entry.stageId ?? ''} onChange={e => onChange({ stageId: e.target.value || undefined })} className={fieldClass}>
            <option value="">Sin etapa</option>
            {stages.map(st => <option key={st.id} value={st.id}>{st.label || 'Sin nombre'}</option>)}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-700">Una línea</span>
        <input value={entry.title} maxLength={120} placeholder="Hormigonado de losa del piso 7."
          enterKeyHint="done" onChange={e => onChange({ title: e.target.value })} className={fieldClass} />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-700">Ángulo de la foto (opcional)</span>
        <input value={entry.view ?? ''} list={id('views')} maxLength={40} placeholder="Frente, Dron…"
          onChange={e => onChange({ view: e.target.value || undefined })} className={fieldClass} />
        <datalist id={id('views')}>
          {viewOptions.map(v => <option key={v} value={v} />)}
        </datalist>
        <span className="text-[11px] text-gray-500">Repetí siempre el mismo nombre: el time-lapse agrupa las fotos por ángulo.</span>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-gray-700">Texto (opcional)</span>
        <textarea value={entry.body ?? ''} maxLength={1000} placeholder="Lo que quieras contar de este mes."
          onChange={e => onChange({ body: e.target.value || undefined })}
          className={`${fieldClass} py-2.5 min-h-[84px] resize-y`} />
      </label>

      <VideoUploader
        label="Clip corto (opcional)"
        value={entry.video ?? ''}
        onChange={url => onChange({ video: url || undefined })}
        folder="construction"
        onUploadingChange={v => report('video', v)}
      />
    </div>
  );
}
