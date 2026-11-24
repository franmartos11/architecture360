'use client';

import { useRef, useState } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import Dialog from '@/components/ui/Dialog';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { DIRECTION_LABEL, VIEW_DIRECTIONS, parseStoredViewPhotos } from '@/lib/floor-views';
import type { FloorViewPhoto, ViewDirection } from '@/types';

// Vista desde un piso: una foto por orientación (relevamiento con drone) y una
// panorámica 360° opcional. Cada cambio se guarda solo, como el plano.
// La unidad del sitio muestra la foto de su orientación (lib/floor-views).
// Spec: docs/superpowers/specs/2026-11-24-vista-por-piso-design.md

// Grilla tipo brújula: N arriba, S abajo, E a la derecha.
const GRID: (ViewDirection | null)[] = ['NO', 'N', 'NE', 'O', null, 'E', 'SO', 'S', 'SE'];

export default function FloorViewsModal({ floor, onClose, onChanged }: {
  floor: { id: string; label: string; view_photos?: unknown; view_panorama?: string | null };
  onClose: () => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [photos, setPhotos] = useState<FloorViewPhoto[]>(() => parseStoredViewPhotos(floor.view_photos));
  const [panorama, setPanorama] = useState<string>(floor.view_panorama ?? '');
  // El uploader llama a onChange con el closure del render en que se eligió el
  // archivo; con dos subidas en paralelo, armar la lista desde `photos` haría
  // que la segunda pise a la primera. La lista viva va en un ref y los
  // guardados salen de a uno, siempre con lo último.
  const photosRef = useRef(photos);
  const panoramaRef = useRef(panorama);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const patch = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/admin/floors/${floor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const withPhoto = (list: FloorViewPhoto[], direction: ViewDirection, url: string) =>
    VIEW_DIRECTIONS.flatMap(d => {
      if (d === direction) return url ? [{ direction: d, url }] : [];
      const p = list.find(x => x.direction === d);
      return p ? [p] : [];
    });

  const enqueue = (job: () => Promise<void>) => { queue.current = queue.current.then(job); };

  const setPhoto = (direction: ViewDirection, url: string) => {
    const previous = photosRef.current.find(p => p.direction === direction)?.url ?? '';
    photosRef.current = withPhoto(photosRef.current, direction, url);
    setPhotos(photosRef.current);
    enqueue(async () => {
      if (await patch({ viewPhotos: photosRef.current })) { onChanged(); return; }
      // Se revierte solo esta orientación: las otras pudieron guardarse bien.
      if ((photosRef.current.find(p => p.direction === direction)?.url ?? '') === url) {
        photosRef.current = withPhoto(photosRef.current, direction, previous);
        setPhotos(photosRef.current);
      }
      toast('No se pudo guardar la vista.', 'error');
    });
  };

  const savePanorama = (url: string) => {
    const previous = panoramaRef.current;
    panoramaRef.current = url;
    setPanorama(url);
    enqueue(async () => {
      if (await patch({ viewPanorama: panoramaRef.current || null })) { onChanged(); return; }
      if (panoramaRef.current === url) { panoramaRef.current = previous; setPanorama(previous); }
      toast('No se pudo guardar la vista.', 'error');
    });
  };

  const urlOf = (d: ViewDirection) => photos.find(p => p.direction === d)?.url ?? '';

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Vista desde ${floor.label}`}
      footer={<Button type="button" variant="ghost" onClick={onClose} className="bg-transparent hover:bg-gray-100">Cerrar</Button>}
    >
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-gray-600">
          Subí una foto de lo que se ve desde la altura de este piso hacia cada lado (por ejemplo, con un drone). Cada unidad muestra la foto de su orientación. Se guarda sola.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {GRID.map((d, i) => d ? (
            <div key={d} className="min-w-0">
              <ImageUploader value={urlOf(d)} onChange={url => setPhoto(d, url)} folder="floor-views" label={DIRECTION_LABEL[d]} compress />
            </div>
          ) : (
            <div key={`centro-${i}`} className="flex items-center justify-center rounded-lg bg-gray-50 text-xs font-semibold text-gray-500 text-center px-2">
              {floor.label}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <ImageUploader value={panorama} onChange={savePanorama} folder="tours" label="Panorámica 360°" />
          <span className="text-xs text-gray-500">Opcional. Imagen equirectangular (2:1), como las del recorrido 360°: se revisa igual al subirla.</span>
        </div>
      </div>
    </Dialog>
  );
}
