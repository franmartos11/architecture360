'use client';

import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent, type Announcements,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fieldClass } from '@/components/admin/panel-ui';
import { MAX_STAGES, newProgressId } from '@/lib/construction-progress';
import type { ConstructionStage } from '@/types';

// Etapas de la obra, en orden y con fechas opcionales. El orden se cambia
// arrastrando el asa (⠿) — con el teclado también: foco en el asa,
// espacio para levantar, flechas para mover, espacio para soltar.
//
// Fechas con <input type="date"> y no type="month", aunque una etapa se
// piense en meses: "month" no existe en Safari ni en Firefox de escritorio
// (cae a un campo de texto libre donde nadie sabe qué formato escribir), y
// "date" anda en todos lados. Se guarda el día tal cual; la vista pública
// muestra mes y año.

export default function StagesEditor({ stages, onChange }: {
  stages: ConstructionStage[];
  onChange: (stages: ConstructionStage[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const labelOf = (id: string | number) => {
    const i = stages.findIndex(s => s.id === id);
    return i < 0 ? 'la etapa' : `"${stages[i].label || `Etapa ${i + 1}`}"`;
  };
  const posOf = (id: string | number) => stages.findIndex(s => s.id === id) + 1;
  // dnd-kit anuncia en inglés por defecto.
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Levantaste ${labelOf(active.id)}, en el lugar ${posOf(active.id)} de ${stages.length}.`,
    onDragOver: ({ active, over }) => (over ? `${labelOf(active.id)} pasa al lugar ${posOf(over.id)} de ${stages.length}.` : `${labelOf(active.id)} está fuera de la lista.`),
    onDragEnd: ({ active, over }) => (over ? `Soltaste ${labelOf(active.id)} en el lugar ${posOf(over.id)}.` : `Soltaste ${labelOf(active.id)}.`),
    onDragCancel: ({ active }) => `Cancelado. ${labelOf(active.id)} vuelve a su lugar.`,
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = stages.findIndex(s => s.id === active.id);
    const to = stages.findIndex(s => s.id === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove(stages, from, to));
  };
  const patch = (id: string, p: Partial<ConstructionStage>) => onChange(stages.map(s => (s.id === id ? { ...s, ...p } : s)));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-gray-700">Etapas, en el orden de la obra</span>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
        accessibility={{
          announcements,
          screenReaderInstructions: { draggable: 'Para mover una etapa, apretá espacio, movela con las flechas y apretá espacio de nuevo para soltarla. Escape cancela.' },
        }}
      >
        <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
          <ol className="flex flex-col gap-2 m-0 p-0 list-none">
            {stages.map((st, i) => (
              <StageRow key={st.id} stage={st} index={i}
                onPatch={p => patch(st.id, p)}
                onRemove={() => onChange(stages.filter(x => x.id !== st.id))} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
      {stages.length < MAX_STAGES && (
        <button type="button" onClick={() => onChange([...stages, { id: newProgressId(), label: '' }])}
          className="self-start min-h-[40px] text-[13px] font-semibold text-brand-700">+ Agregar etapa</button>
      )}
    </div>
  );
}

function StageRow({ stage, index, onPatch, onRemove }: {
  stage: ConstructionStage;
  index: number;
  onPatch: (p: Partial<ConstructionStage>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const name = stage.label || `etapa ${index + 1}`;
  return (
    <li ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 1 : undefined }}
      className={`rounded-xl border bg-white p-2.5 flex flex-col gap-2 ${isDragging ? 'border-gray-400 shadow-lg' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2">
        <button type="button" {...attributes} {...listeners} aria-label={`Mover ${name}`}
          className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-grab active:cursor-grabbing touch-none">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
            <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
            <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
          </svg>
        </button>
        <span className="w-5 shrink-0 text-xs text-gray-500 tabular-nums text-right" aria-hidden="true">{index + 1}.</span>
        <input value={stage.label} maxLength={40} aria-label={`Nombre de la etapa ${index + 1}`} placeholder="Nombre de la etapa"
          onChange={e => onPatch({ label: e.target.value })} className={`${fieldClass} flex-1 min-w-0`} />
        <button type="button" onClick={onRemove} aria-label={`Borrar ${name}`}
          className="w-10 h-10 shrink-0 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50">✕</button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:pl-[76px]">
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-gray-600">Desde (opcional)</span>
          <input type="date" value={stage.from ?? ''} max={stage.to || undefined}
            onChange={e => onPatch({ from: e.target.value || undefined })} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 min-w-0">
          <span className="text-[11px] text-gray-600">Hasta (opcional)</span>
          <input type="date" value={stage.to ?? ''} min={stage.from || undefined}
            onChange={e => onPatch({ to: e.target.value || undefined })} className={fieldClass} />
        </label>
      </div>
    </li>
  );
}
