'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, rectSortingStrategy, useSortable, arrayMove, sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import ImageUploader from './ImageUploader';
import { uploadViaSignedUrl } from '@/lib/signed-upload';
import { compressImage } from '@/lib/image-compress';

interface MultiImageUploaderProps {
  values: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  label?: string;
  /** Achica cada foto en el navegador antes de subirla — ver el mismo prop en ImageUploader. Apagado por defecto. */
  compress?: boolean;
  /** Tope de fotos: lo que se elija de más queda afuera con un aviso (en vez de cortarse en silencio al guardar). */
  max?: number;
  /** Ver el mismo prop en ImageUploader: para no guardar con subidas a medias. */
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * `list` (default): una fila por foto, con su propio uploader y campo de
   * URL. `grid`: miniaturas en grilla, la primera marcada como portada —
   * más compacto, para cargar muchas fotos desde el celular.
   */
  variant?: 'list' | 'grid';
  /**
   * En pantallas angostas, dos botones en lugar de la zona de arrastre:
   * "Sacar foto" (abre la cámara) y "Elegir de la galería". Son dos inputs
   * distintos a propósito: un solo input con `capture` en iOS va directo a
   * la cámara y no deja elegir fotos ya sacadas.
   */
  cameraButtons?: boolean;
}

/** Cuántas fotos se comprimen a la vez: cada una ocupa decenas de MB decodificada y un celular se queda sin memoria con doce juntas. */
const COMPRESS_CONCURRENCY = 2;

/** Corre `fn` sobre cada ítem con a lo sumo `limit` en paralelo, conservando el orden de los resultados. */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const DND_INSTRUCTIONS = {
  draggable: 'Para mover una foto, apretá espacio, movela con las flechas y apretá espacio de nuevo para soltarla. Escape cancela.',
};

export default function MultiImageUploader({
  values, onChange, folder, label, compress = false, max, onUploadingChange, variant = 'list', cameraButtons = false,
}: MultiImageUploaderProps) {
  const [pending, setPending] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  // Subidas en curso, contadas fuera del estado para decidir en el momento
  // (dos tandas seguidas desde la cámara) sin esperar un render.
  const pendingRef = useRef(0);
  // Las URLs más recientes del padre: una tanda que termina después de otra
  // tiene que sumarse a lo que dejó la anterior, no a lo que había cuando
  // empezó (si no, la segunda foto sacada pisa a la primera).
  const valuesRef = useRef(values);
  useEffect(() => { valuesRef.current = values; });
  const uploading = pending > 0;
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
    const toUpload = compress ? await compressImage(file) : file;
    const result = await uploadViaSignedUrl<{ url: string }>('/api/admin/upload', toUpload, { folder });
    setProgress(p => ({ ...p, done: p.done + 1 }));
    return result.ok ? result.data.url : null;
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    let files = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (files.length === 0) return;
    let notice = '';
    if (max != null) {
      const room = Math.max(0, max - valuesRef.current.length - pendingRef.current);
      if (files.length > room) {
        notice = room === 0
          ? `Ya hay ${max} fotos, el máximo.`
          : `Hasta ${max} fotos: quedaron afuera ${files.length - room}.`;
        files = files.slice(0, room);
      }
    }
    setError(notice);
    if (files.length === 0) return;

    const startingFresh = pendingRef.current === 0;
    pendingRef.current += files.length;
    setPending(pendingRef.current);
    setProgress(p => (startingFresh ? { done: 0, total: files.length } : { ...p, total: p.total + files.length }));
    if (startingFresh) onUploadingChange?.(true);

    const results = await mapPool(files, compress ? COMPRESS_CONCURRENCY : files.length, uploadOne);
    const urls = results.filter((u): u is string => !!u);
    const failed = results.length - urls.length;
    pendingRef.current -= files.length;
    setPending(pendingRef.current);
    if (pendingRef.current === 0) onUploadingChange?.(false);
    if (urls.length > 0) {
      const next = [...valuesRef.current, ...urls];
      valuesRef.current = next;
      onChange(next);
    }
    if (failed > 0) setError(`${failed} imagen${failed === 1 ? '' : 'es'} no se pud${failed === 1 ? 'o' : 'ieron'} subir.`);
  };

  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = '';
  };
  const full = max != null && values.length >= max;

  const ids = values.map((_, i) => `${idPrefix}${i}`);
  const uploadingLabel = `Subiendo ${progress.done}/${progress.total}...`;

  const dropzone = (
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
        ${cameraButtons ? 'hidden sm:block' : ''}
        ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
    >
      {uploading ? uploadingLabel : 'Arrastrá una o más imágenes o hacé click para elegirlas'}
    </div>
  );

  // Los inputs viven afuera de la zona de arrastre: con cameraButtons la
  // zona se oculta en el celular y los botones los siguen necesitando.
  const inputs = (
    <>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" aria-hidden="true" tabIndex={-1} onChange={pickFiles} />
      {cameraButtons && (
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden="true" tabIndex={-1} onChange={pickFiles} />
      )}
    </>
  );

  const mobileButtons = cameraButtons && (
    <div className="grid grid-cols-2 gap-2 sm:hidden">
      <button type="button" onClick={() => cameraRef.current?.click()} disabled={full}
        className="min-h-[52px] rounded-xl bg-gray-900 text-white text-sm font-semibold disabled:opacity-40">
        Sacar foto
      </button>
      <button type="button" onClick={() => inputRef.current?.click()} disabled={full}
        className="min-h-[52px] rounded-xl border border-gray-300 bg-white text-gray-900 text-sm font-semibold disabled:opacity-40">
        Elegir de la galería
      </button>
      {uploading && <p className="col-span-2 m-0 text-xs text-gray-600" role="status">{uploadingLabel}</p>}
    </div>
  );

  if (variant === 'grid') {
    return (
      <div>
        {label && <span className="block text-sm font-medium text-gray-700 mb-2">{label}</span>}
        <div className="flex flex-col gap-3">
          {(values.length > 0 || uploading) && (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={{ screenReaderInstructions: DND_INSTRUCTIONS }}>
              <SortableContext items={ids} strategy={rectSortingStrategy}>
                <ul className="m-0 p-0 list-none grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(96px, 30%), 1fr))' }}>
                  {values.map((v, i) => (
                    <SortableThumb key={ids[i]} id={ids[i]} src={v} index={i} onRemove={() => removeAt(i)} />
                  ))}
                  {Array.from({ length: pending }, (_, i) => (
                    <li key={`pending-${i}`} aria-hidden="true" className="aspect-square rounded-xl bg-gray-100 animate-pulse" />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}
          {mobileButtons}
          {!full && dropzone}
          {inputs}
          {error && <p className="m-0 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    );
  }

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
                compress={compress}
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

        {mobileButtons}
        {!full && dropzone}
        {inputs}
        {error && <p className="text-xs text-red-500">{error}</p>}

        {!full && (
          <button type="button" onClick={addEmpty} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            + Agregar imagen por URL
          </button>
        )}
      </div>
    </div>
  );
}

// Miniatura de la grilla. El arrastre se toma solo del asa (⠿), no de toda
// la foto: en el celular la grilla también se usa para scrollear, y una
// foto entera con `touch-none` trabaría el scroll de la página.
function SortableThumb({ id, src, index, onRemove }: { id: string; src: string; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 1 : undefined };
  return (
    <li ref={setNodeRef} style={style} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura del admin
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="w-full h-full flex items-center justify-center text-[11px] text-gray-400">Sin imagen</span>
      )}
      {index === 0 && (
        <span className="absolute left-1.5 bottom-1.5 px-1.5 py-0.5 rounded-md bg-gray-900/80 text-white text-[10px] font-semibold">Portada</span>
      )}
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Mover la foto ${index + 1}`}
        className="absolute left-1 top-1 w-9 h-9 rounded-lg bg-white/90 text-gray-600 flex items-center justify-center cursor-grab active:cursor-grabbing touch-none shadow-sm"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="5" cy="3" r="1.3" /><circle cx="11" cy="3" r="1.3" />
          <circle cx="5" cy="8" r="1.3" /><circle cx="11" cy="8" r="1.3" />
          <circle cx="5" cy="13" r="1.3" /><circle cx="11" cy="13" r="1.3" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar la foto ${index + 1}`}
        className="absolute right-1 top-1 w-9 h-9 rounded-lg bg-white/90 text-gray-700 hover:text-red-700 flex items-center justify-center shadow-sm"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </li>
  );
}

interface SortableImageRowProps {
  id: string;
  value: string;
  folder: string;
  compress: boolean;
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
function SortableImageRow({ id, value, folder, compress, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: SortableImageRowProps) {
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
        <ImageUploader value={value} onChange={onChange} folder={folder} compress={compress} />
      </div>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-red-500 mt-4 shrink-0">×</button>
    </div>
  );
}
