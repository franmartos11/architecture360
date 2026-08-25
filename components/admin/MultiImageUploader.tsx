'use client';

import { useId, useRef, useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ImageUploader from './ImageUploader';

interface MultiImageUploaderProps {
  values: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  label?: string;
}

export default function MultiImageUploader({ values, onChange, folder, label }: MultiImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Cada foto de la galería puede repetirse (dos URLs iguales, o dos vacías
  // recién agregadas con "+ Agregar por URL") — el índice no sirve como id
  // estable para dnd-kit porque cambia con cada reorden. Un id sintético
  // por posición inicial alcanza: solo hace falta que no cambie mientras
  // dura el drag.
  const idPrefix = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const updateAt = (i: number, url: string) => {
    const next = [...values];
    next[i] = url;
    onChange(next);
  };
  const removeAt = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const addEmpty = () => onChange([...values, '']);
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).slice(idPrefix.length));
    const to = Number(String(over.id).slice(idPrefix.length));
    onChange(arrayMove(values, from, to));
  };

  // Sube todos los archivos en paralelo (uno por request, mismo endpoint
  // que ImageUploader) y agrega las URLs que resulten al final de la
  // galería en el orden en que se eligieron — así una carga de 20 fotos no
  // obliga a repetir "+ Agregar imagen" veinte veces.
  const uploadOne = async (file: File): Promise<string | null> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const data = await res.json();
      return res.ok ? data.url : null;
    } catch {
      return null;
    } finally {
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const results = await Promise.all(files.map(uploadOne));
    const urls = results.filter((u): u is string => !!u);
    const failed = results.length - urls.length;
    setUploading(false);
    if (urls.length > 0) onChange([...values, ...urls]);
    if (failed > 0) setError(`${failed} imagen${failed === 1 ? '' : 'es'} no se pud${failed === 1 ? 'o' : 'ieron'} subir.`);
  };

  const ids = values.map((_, i) => `${idPrefix}${i}`);

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div className="space-y-3">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {values.map((v, i) => (
              <SortableImageRow
                key={ids[i]}
                id={ids[i]}
                value={v}
                folder={folder}
                onChange={url => updateAt(i, url)}
                onRemove={() => removeAt(i)}
                onMoveUp={() => move(i, -1)}
                onMoveDown={() => move(i, 1)}
                canMoveUp={i > 0}
                canMoveDown={i < values.length - 1}
              />
            ))}
          </SortableContext>
        </DndContext>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Subir una o más imágenes: arrastrá archivos o hacé click para elegirlos"
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={`px-3 py-2.5 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
            ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
        >
          {uploading ? `Subiendo ${progress.done}/${progress.total}...` : 'Arrastrá una o más imágenes o hacé click para elegirlas'}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
            onChange={e => {
              if (e.target.files?.length) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}

        <button type="button" onClick={addEmpty} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          + Agregar imagen por URL
        </button>
      </div>
    </div>
  );
}

interface SortableImageRowProps {
  id: string;
  value: string;
  folder: string;
  onChange: (url: string) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

// Fila arrastrable de la galería — el handle (⠿) inicia el drag; las
// flechas de subir/bajar se mantienen al lado como alternativa accesible,
// sin depender de poder arrastrar con precisión (touch, mouse impreciso,
// teclado sin soporte de dnd-kit en ese contexto).
function SortableImageRow({ id, value, folder, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: SortableImageRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-start gap-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
        className="w-5 h-8 mt-4 flex items-center justify-center text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
        </svg>
      </button>
      <div className="flex flex-col mt-4 shrink-0">
        <button
          type="button"
          onClick={onMoveUp}
          disabled={!canMoveUp}
          aria-label="Subir"
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={!canMoveDown}
          aria-label="Bajar"
          className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
      </div>
      <div className="flex-1">
        <ImageUploader value={value} onChange={onChange} folder={folder} />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 mt-4 shrink-0">×</button>
    </div>
  );
}
