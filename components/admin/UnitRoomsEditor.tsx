'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect, useMemo, useRef, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { PlanSkeleton } from '@/components/admin/PanelSkeletons';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { slugify } from '@/lib/slug';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { matchRoomByFilename } from '@/lib/guided-structure';
import { preparePanorama } from '@/lib/panorama';
import { compressImage } from '@/lib/image-compress';
import { uploadViaSignedUrl } from '@/lib/signed-upload';
import type { TourData, TourNode, Room, UnitLevel } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import { levelLabel } from '@/lib/unit-levels';

type CopySourceUnit = Pick<DbUnitRow, 'id' | 'code' | 'room_plan_image' | 'rooms' | 'levels' | 'tour_image_url' | 'tour_data'> & {
  building_name: string | null;
  floor_number: number | null;
};

const PALETTE = ['#83978c', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

// Una "planta" editable — la planta baja/única vive siempre en
// room_plan_image/rooms (igual que antes de que existiera el tipo casa de
// varios niveles, para no migrar datos); las plantas de más (2+) viven en
// el array `levels`, uno por nivel. Acá se las unifica bajo una misma
// forma para que el resto del componente no tenga que distinguir "la
// planta base" de "una planta extra" en cada handler.
type EditableLevel = { key: 'base' | string; label: string; planImage: string; plan3dImage?: string | null; rooms: Room[] };

// Delimitador de ambientes (dormitorio, cocina, baño, etc.) dentro de una
// unidad — se usa tanto en su propia pantalla standalone
// (unidades/[unitId]/ambientes/page.tsx) como embebido como pestaña dentro de
// "Delimitar deptos en el plano", para tener todo el flujo de delimitación
// (piso → depto → ambientes) en un mismo lugar.
//
// Cuando la unidad tiene más de una planta (floorsCount > 1, hoy solo
// posible en casa), arriba del plano aparece un selector de planta — cada
// una con su propio plano y sus propios ambientes delimitados encima.
interface UnitRoomsEditorProps {
  buildingId: string;
  floorId: string;
  unitId: string;
  onOpenTourEditor?: () => void;
  onTourDataUpdated?: (tourData: TourData | null) => void;
}

export default function UnitRoomsEditor({
  buildingId,
  floorId,
  unitId,
  onOpenTourEditor,
  onTourDataUpdated,
}: UnitRoomsEditorProps) {
  const contentIn = useContentIn();
  const typeConfig = useProjectTypeConfig();
  const { unitLabel } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const [unitCode, setUnitCode] = useState('');
  const [unitCounts, setUnitCounts] = useState<{ bedrooms: number; bathrooms: number; livingRooms: number }>({
    bedrooms: 1,
    bathrooms: 1,
    livingRooms: 1,
  });
  const [unitTourData, setUnitTourData] = useState<TourData | null>(null);
  const [floorsCount, setFloorsCount] = useState(1);
  const [baseImage, setBaseImage] = useState('');
  const [baseRooms, setBaseRooms] = useState<Room[]>([]);
  const [extraLevels, setExtraLevels] = useState<UnitLevel[]>([]);
  const [activeLevelIdx, setActiveLevelIdx] = useState(0);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingShape, setSavingShape] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [otherUnits, setOtherUnits] = useState<CopySourceUnit[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const [batchUpload, setBatchUpload] = useState<{ mode: 'photos' | 'tours'; done: number; total: number; pct: number } | null>(null);
  const [batchUnmatched, setBatchUnmatched] = useState<{ url: string; name: string; mode: 'photos' | 'tours' }[]>([]);
  const [batchDragMode, setBatchDragMode] = useState<'photos' | 'tours' | null>(null);
  const batchPhotosRef = useRef<HTMLInputElement>(null);
  const batchToursRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const confirmDialog = useConfirm();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch(`/api/admin/units/${unitId}`)
      .then(res => res.json())
      .then(unit => {
        setUnitCode(unit.code ?? '');
        setUnitCounts({
          bedrooms: Number(unit.bedrooms ?? 1),
          bathrooms: Number(unit.bathrooms ?? 1),
          livingRooms: Number(unit.living_rooms ?? 1),
        });
        setUnitTourData(unit.tour_data ?? null);
        onTourDataUpdated?.(unit.tour_data ?? null);
        setFloorsCount(unit.floors_count ?? 1);
        setBaseImage(unit.room_plan_image ?? '');
        setBaseRooms(unit.rooms ?? []);
        setExtraLevels(unit.levels ?? []);
        setActiveLevelIdx(0);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [unitId]);

  // Plantas efectivas a mostrar: la base + una por cada planta de más que
  // declare floorsCount — si todavía no se cargó nada para una, se le
  // ofrece un placeholder vacío en vez de esperar a que exista en la DB.
  const levels: EditableLevel[] = useMemo(() => {
    const extra: EditableLevel[] = Array.from({ length: Math.max(0, floorsCount - 1) }, (_, i) => {
      const existing = extraLevels[i];
      return {
        key: existing?.id ?? `piso-${i + 1}`,
        label: existing?.label ?? levelLabel(i + 1, floorsCount),
        planImage: existing?.planImage ?? '',
        plan3dImage: existing?.plan3dImage ?? null,
        rooms: existing?.rooms ?? [],
      };
    });
    return [{ key: 'base', label: 'Planta baja', planImage: baseImage, rooms: baseRooms }, ...extra];
  }, [floorsCount, extraLevels, baseImage, baseRooms]);

  const activeLevel = levels[activeLevelIdx] ?? levels[0];
  const roomPlanImage = activeLevel.planImage;
  const rooms = activeLevel.rooms;

  // Cuando cambia la planta activa, el lienzo de delimitación arranca de
  // cero con los puntos ya guardados de esa planta (los de la anterior no
  // aplican a esta imagen) — se resuelve durante el render, comparando
  // contra el índice/clave de planta del render anterior, en vez de en un
  // efecto.
  const [prevActiveLevelIdx, setPrevActiveLevelIdx] = useState(activeLevelIdx);
  const [prevActiveLevelKey, setPrevActiveLevelKey] = useState(activeLevel.key);
  if (activeLevelIdx !== prevActiveLevelIdx || activeLevel.key !== prevActiveLevelKey) {
    setPrevActiveLevelIdx(activeLevelIdx);
    setPrevActiveLevelKey(activeLevel.key);
    setPoints(Object.fromEntries(activeLevel.rooms.map(r => [r.id, r.polygon ?? []])));
    setActiveId(activeLevel.rooms[0]?.id ?? null);
  }

  // Unidades candidatas para "copiar diseño": cualquier otra unidad del
  // proyecto que ya tenga ambientes o recorrido 360° cargado.
  useEffect(() => {
    fetch(withActiveProject('/api/admin/units', activeProjectId))
      .then(res => res.json())
      .then((data: CopySourceUnit[]) => {
        setOtherUnits(
          Array.isArray(data)
            ? data.filter(u => u.id !== unitId && (
                (u.rooms?.length ?? 0) > 0 || !!u.room_plan_image
                || (u.levels ?? []).some(l => l.rooms.length > 0 || !!l.planImage)
              ))
            : []
        );
      })
      .catch(() => {});
  }, [unitId, activeProjectId]);

  const handleCopyFromUnit = async () => {
    const source = otherUnits.find(u => u.id === copySourceId);
    if (!source) return;
    const ok = await confirmDialog({ message: `Esto reemplaza los planos de ambientes (todas las plantas) y el recorrido 360° actuales por los de "${source.code}". ¿Continuar?`, confirmLabel: 'Reemplazar' });
    if (!ok) return;
    setCopying(true);
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomPlanImage: source.room_plan_image,
        rooms: source.rooms,
        levels: source.levels,
        tourImageUrl: source.tour_image_url,
        tourData: source.tour_data,
      }),
    });
    setCopying(false);
    if (res.ok) {
      toast('Diseño copiado.');
      setCopySourceId('');
      load();
    } else {
      toast('Error al copiar el diseño.', 'error');
    }
  };

  // Persiste rooms/planImage/tourData de la planta activa — si es la planta
  // base pisa room_plan_image/rooms como siempre; si es una planta extra,
  // arma el array `levels` completo (con las demás plantas intactas) y lo
  // manda entero, porque la columna es un solo JSONB sin API para tocar un
  // elemento suelto.
  const persistLevel = async (updates: { planImage?: string; rooms?: Room[] }, extra?: Record<string, unknown>) => {
    const body: Record<string, unknown> = { ...extra };
    if (activeLevelIdx === 0) {
      if (updates.planImage !== undefined) body.roomPlanImage = updates.planImage || null;
      if (updates.rooms !== undefined) body.rooms = updates.rooms;
    } else {
      const i = activeLevelIdx - 1;
      const nextExtra = levels.slice(1).map((l, idx) => ({
        id: l.key,
        label: l.label,
        planImage: idx === i ? (updates.planImage ?? l.planImage) || null : l.planImage || null,
        plan3dImage: l.plan3dImage ?? null,
        rooms: idx === i ? (updates.rooms ?? l.rooms) : l.rooms,
      }));
      body.levels = nextExtra;
    }
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast('Error al guardar.', 'error');
      return false;
    }
    if (activeLevelIdx === 0) {
      if (updates.planImage !== undefined) setBaseImage(updates.planImage);
      if (updates.rooms !== undefined) setBaseRooms(updates.rooms);
    } else {
      const i = activeLevelIdx - 1;
      setExtraLevels(levels.slice(1).map((l, idx) => ({
        id: l.key,
        label: l.label,
        planImage: idx === i ? (updates.planImage ?? l.planImage) : l.planImage,
        plan3dImage: l.plan3dImage ?? null,
        rooms: idx === i ? (updates.rooms ?? l.rooms) : l.rooms,
      })));
    }
    if (extra?.tourData !== undefined) {
      const nextTour = (extra.tourData as TourData | null) ?? null;
      setUnitTourData(nextTour);
      onTourDataUpdated?.(nextTour);
    }
    return true;
  };

  const handleSuggestRooms = async () => {
    const suggested: Room[] = [];
    const seen = new Set<string>();
    const pushRoom = (name: string, kind: NonNullable<Room['kind']>) => {
      const id = slugify(name) || `amb-${suggested.length + 1}`;
      if (seen.has(id)) return;
      seen.add(id);
      suggested.push({ id, name, kind, polygon: [] });
    };
    const livings = Math.max(1, unitCounts.livingRooms || 1);
    for (let i = 1; i <= livings; i++) pushRoom(livings > 1 ? `Living ${i}` : 'Living', 'living');
    pushRoom('Cocina', 'kitchen');
    const beds = Math.max(0, unitCounts.bedrooms);
    for (let i = 1; i <= beds; i++) pushRoom(beds > 1 ? `Dormitorio ${i}` : 'Dormitorio', 'bedroom');
    const baths = Math.max(1, Math.round(unitCounts.bathrooms || 1));
    for (let i = 1; i <= baths; i++) pushRoom(baths > 1 ? `Baño ${i}` : 'Baño', 'bathroom');
    pushRoom('Balcón / Exterior', 'other');

    const ok = await persistLevel({ rooms: suggested });
    if (ok) {
      setPoints(Object.fromEntries(suggested.map(r => [r.id, []])));
      setActiveId(suggested[0]?.id ?? null);
      toast(`${suggested.length} ambientes creados.`);
    }
  };

  const handleSaveImage = async (url: string) => {
    setSavingImage(true);
    const ok = await persistLevel({ planImage: url });
    setSavingImage(false);
    if (ok) toast('Guardado.');
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    const id = slugify(newRoomName) || 'ambiente';
    if (rooms.some(r => r.id === id)) {
      toast('Ya existe un ambiente con ese nombre.', 'error');
      return;
    }
    const newRoom: Room = { id, name: newRoomName.trim(), polygon: [] };
    const ok = await persistLevel({ rooms: [...rooms, newRoom] });
    if (ok) {
      setPoints(prev => ({ ...prev, [id]: [] }));
      setActiveId(id);
      setNewRoomName('');
    }
  };

  const handleRenameRoom = async (id: string, updates: Partial<Pick<Room, 'name' | 'tourNodeId'>>) => {
    const next = rooms.map(r => (r.id === id ? { ...r, ...updates } : r));
    await persistLevel({ rooms: next });
  };

  // Fotos del ambiente (las que se ven en la ficha pública al desplegarlo) —
  // mismo `Room.imageUrl`/`images` que carga el editor de programa de casa;
  // acá se guardan al toque, como el resto de este editor.
  const handleRoomPhotos = async (id: string, updates: Partial<Pick<Room, 'imageUrl' | 'images'>>) => {
    const next = rooms.map(r => (r.id === id ? { ...r, ...updates } : r));
    const ok = await persistLevel({ rooms: next });
    if (ok) toast('Foto guardada.');
  };

  // Subir una panorámica directo desde el ambiente crea (o actualiza) su
  // nodo en el recorrido 360° y lo vincula solo, sin pasar por la pantalla
  // separada de Recorrido ni por el <select> de sincronización manual. El
  // recorrido es único por unidad (no por planta), así que viaja aparte de
  // los rooms en el mismo PATCH.
  const handleRoomPanoramaUpload = async (room: Room, url: string) => {
    if (!url) {
      const removedNodeId = room.tourNodeId;
      const nextRooms = rooms.map(r => (r.id === room.id ? { ...r, tourNodeId: undefined } : r));
      if (!removedNodeId || !unitTourData) {
        const ok = await persistLevel({ rooms: nextRooms });
        if (ok) toast('Panorámica quitada.');
        return;
      }
      const nextNodes = unitTourData.nodes.filter(n => n.id !== removedNodeId);
      const nextInitial = unitTourData.initialNodeId === removedNodeId ? (nextNodes[0]?.id ?? '') : unitTourData.initialNodeId;
      const nextTour: TourData | null = nextNodes.length > 0 ? { initialNodeId: nextInitial, nodes: nextNodes } : null;
      const ok = await persistLevel({ rooms: nextRooms }, { tourData: nextTour });
      if (ok) toast('Panorámica quitada.');
      return;
    }
    const ok = await applyRoomAssignments('tours', [{ roomId: room.id, url }]);
    if (ok) toast('Panorámica vinculada al ambiente.');
  };

  const applyRoomAssignments = async (
    uploadMode: 'photos' | 'tours',
    hits: { roomId: string; url: string }[]
  ): Promise<boolean> => {
    if (hits.length === 0) return true;
    let nextRooms = [...rooms];
    let nextTour: TourData | undefined;

    if (uploadMode === 'photos') {
      const byRoom = new Map<string, string[]>();
      for (const h of hits) {
        const list = byRoom.get(h.roomId) ?? [];
        list.push(h.url);
        byRoom.set(h.roomId, list);
      }
      nextRooms = nextRooms.map(r => {
        const urls = byRoom.get(r.id);
        if (!urls?.length) return r;
        const primary = r.imageUrl || urls[0];
        const rest = r.imageUrl ? urls : urls.slice(1);
        const merged = [...(r.images ?? []), ...rest];
        return { ...r, imageUrl: primary, images: merged.length ? merged : undefined };
      });
    } else {
      const currentTour = unitTourData ?? { initialNodeId: '', nodes: [] };
      const nodes = [...currentTour.nodes];
      let initialNodeId = currentTour.initialNodeId;
      for (const h of hits) {
        const room = nextRooms.find(r => r.id === h.roomId);
        if (!room) continue;
        const existingIdx = nodes.findIndex(n => n.id === room.tourNodeId);
        if (existingIdx >= 0) {
          nodes[existingIdx] = { ...nodes[existingIdx], imageUrl: h.url };
        } else {
          const taken = new Set(nodes.map(n => n.id));
          let nodeId = room.id;
          let n = 2;
          while (taken.has(nodeId)) { nodeId = `${room.id}-${n}`; n++; }
          nodes.push({ id: nodeId, name: room.name, imageUrl: h.url, initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 } });
          if (!initialNodeId) initialNodeId = nodeId;
          nextRooms = nextRooms.map(r => (r.id === room.id ? { ...r, tourNodeId: nodeId } : r));
        }
      }
      nextTour = { initialNodeId: initialNodeId || nodes[0]?.id || '', nodes };
    }

    return persistLevel({ rooms: nextRooms }, nextTour ? { tourData: nextTour } : undefined);
  };

  const handleBatchRoomUpload = async (uploadMode: 'photos' | 'tours', fileList: FileList | null) => {
    const files = Array.from(fileList ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length === 0 || rooms.length === 0) return;

    setBatchUpload({ mode: uploadMode, done: 0, total: files.length, pct: 0 });
    const folder = uploadMode === 'tours' ? 'tours' : 'units';
    const pcts = new Array<number>(files.length).fill(0);
    const hits: { roomId: string; url: string }[] = [];
    const loose: { url: string; name: string; mode: 'photos' | 'tours' }[] = [];
    let failed = 0;
    let cursor = 0;
    let done = 0;

    const worker = async () => {
      while (cursor < files.length) {
        const idx = cursor++;
        const file = files[idx];
        const toUpload = uploadMode === 'tours'
          ? (await preparePanorama(file)).file
          : await compressImage(file);
        const res = await uploadViaSignedUrl<{ url: string }>(
          '/api/admin/upload',
          toUpload,
          { folder },
          {
            onProgress: pct => {
              pcts[idx] = pct;
              const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / files.length);
              setBatchUpload(prev => (prev ? { ...prev, pct: avg } : prev));
            },
          }
        );
        pcts[idx] = 100;
        done += 1;
        if (res.ok) {
          const roomId = matchRoomByFilename(file.name, rooms);
          if (roomId) hits.push({ roomId, url: res.data.url });
          else loose.push({ url: res.data.url, name: file.name, mode: uploadMode });
        } else {
          failed += 1;
        }
        const avg = Math.round(pcts.reduce((a, b) => a + b, 0) / files.length);
        setBatchUpload({ mode: uploadMode, done, total: files.length, pct: avg });
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));

    if (loose.length > 0) setBatchUnmatched(prev => [...prev, ...loose]);

    const ok = await applyRoomAssignments(uploadMode, hits);
    setBatchUpload(null);

    if (hits.length === 0 && loose.length === 0) {
      toast('No se pudo subir ningún archivo.', 'error');
      return;
    }
    if (ok) {
      const suffix = loose.length > 0 ? ` · ${loose.length} para asignar` : '';
      const errSuffix = failed > 0 ? ` · ${failed} con error` : '';
      toast(`${hits.length} asignado${hits.length === 1 ? '' : 's'} por nombre${suffix}${errSuffix}.`, failed > 0 && hits.length === 0 ? 'error' : undefined);
    }
  };

  const assignUnmatchedToRoom = async (item: { url: string; name: string; mode: 'photos' | 'tours' }, roomId: string) => {
    const ok = await applyRoomAssignments(item.mode, [{ roomId, url: item.url }]);
    if (ok) {
      setBatchUnmatched(prev => prev.filter(x => x.url !== item.url));
      toast(item.mode === 'tours' ? '360° vinculado al ambiente.' : 'Foto asignada al ambiente.');
    }
  };

  const handleDeleteRoom = async (id: string) => {
    const confirmed = await confirmDialog({ message: '¿Borrar este ambiente?', confirmLabel: 'Borrar ambiente', danger: true });
    if (!confirmed) return;
    const next = rooms.filter(r => r.id !== id);
    const ok = await persistLevel({ rooms: next });
    if (ok) {
      setPoints(prev => {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      });
      if (activeId === id) setActiveId(next[0]?.id ?? null);
    }
  };

  const handlePointsChange = (id: string, newPoints: { x: number; y: number }[]) => {
    setPoints(prev => ({ ...prev, [id]: newPoints }));
  };

  const handleSaveShape = async (id: string) => {
    setSavingShape(true);
    const next = rooms.map(r => (r.id === id ? { ...r, polygon: points[id] ?? [] } : r));
    const ok = await persistLevel({ rooms: next });
    setSavingShape(false);
    if (ok) toast('Guardado.');
  };

  const handleClear = (id: string) => setPoints(prev => ({ ...prev, [id]: [] }));

  const linkedRoomsCount = useMemo(
    () => rooms.filter(r => r.tourNodeId && unitTourData?.nodes.some(n => n.id === r.tourNodeId)).length,
    [rooms, unitTourData]
  );

  const shapes: PolygonShape[] = useMemo(
    () => rooms.map((r, i) => ({
      id: r.id,
      label: r.name,
      points: points[r.id] ?? [],
      color: PALETTE[i % PALETTE.length],
    })),
    [rooms, points]
  );

  if (loading) return <PlanSkeleton />;
  if (loadError) return <ErrorState message="No se pudo cargar la unidad." onRetry={load} />;

  return (
    <m.div {...contentIn} className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="m-0 font-display text-[22px] font-semibold tracking-[-0.02em] text-gray-900">Ambientes — {unitCode}</h2>
            {rooms.length > 0 && (
              <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${linkedRoomsCount === rooms.length ? 'bg-brand-100 text-brand-800' : 'bg-amber-50 text-amber-800'}`}>
                {linkedRoomsCount}/{rooms.length} con recorrido 360°
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Delimitá cada ambiente sobre el plano {uAgree.del} {unitLabelLower} — arrastrá cualquier punto para ajustarlo, doble click para borrarlo, &quot;Deshacer&quot; (o Ctrl/Cmd+Z) vuelve un paso atrás. Abajo, en cada ambiente, subí sus fotos (se ven en la ficha pública) y su panorámica, que crea el nodo del recorrido 360° automáticamente.
          </p>
        </div>
        {onOpenTourEditor ? (
          <button
            type="button"
            onClick={onOpenTourEditor}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Hotspots 360° →
          </button>
        ) : (
          <Link
            href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/tour`}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Recorrido 360° →
          </Link>
        )}
      </div>

      {levels.length > 1 && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {levels.map((l, i) => (
            <button
              key={l.key}
              onClick={() => setActiveLevelIdx(i)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeLevelIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {l.label}{!l.planImage && <span className="text-amber-800 ml-1">·</span>}
            </button>
          ))}
        </div>
      )}

      {otherUnits.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <p className="text-sm text-gray-600 flex-1">
            ¿{uAgree.Esta} {unitLabel} tiene el mismo diseño que otra ya cargada? Copiá su plano de ambientes (todas las plantas) y recorrido 360° en vez de rehacerlo.
          </p>
          <div className="flex gap-2 w-full sm:w-auto">
            <select
              value={copySourceId}
              onChange={e => setCopySourceId(e.target.value)}
              className="flex-1 sm:w-64 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
            >
              <option value="">Elegir unidad de referencia...</option>
              {otherUnits.map(u => (
                <option key={u.id} value={u.id}>
                  {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleCopyFromUnit}
              disabled={!copySourceId || copying}
              className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              {copying ? 'Copiando...' : 'Copiar diseño'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Plano de ambientes{levels.length > 1 ? ` — ${activeLevel.label}` : ''}</h3>
        </div>
        <div className="p-6">
          <ImageUploader value={roomPlanImage} onChange={handleSaveImage} folder="floorplans" />
          {savingImage && <p className="text-xs text-gray-400 mt-2">Guardando...</p>}
        </div>
      </div>

      {/* La lista de ambientes (nombre, fotos, panorámica) no depende del
          plano: solo la delimitación lo necesita. Sin plano se ve el aviso en
          lugar del lienzo, pero se pueden crear ambientes y subirles fotos. */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        {!roomPlanImage ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
            Cargá el plano de ambientes de arriba para poder delimitarlos. Mientras tanto, podés crear los ambientes y subirles fotos acá al lado.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
              <button
                onClick={() => setMode('rectangle')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'rectangle' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Rectángulo
              </button>
              <button
                onClick={() => setMode('point')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'point' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Forma libre
              </button>
            </div>
            <PolygonCanvas imageUrl={roomPlanImage} shapes={shapes} activeId={activeId} mode={mode} onPointsChange={handlePointsChange} onComplete={handleSaveShape} />
          </div>
        )}

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-900 text-sm">Ambientes</h3>
              {rooms.length > 0 && (
                <input
                  ref={batchPhotosRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { handleBatchRoomUpload('photos', e.target.files); e.target.value = ''; }}
                />
              )}
              {rooms.length > 0 && (
                <input
                  ref={batchToursRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={e => { handleBatchRoomUpload('tours', e.target.files); e.target.value = ''; }}
                />
              )}
            </div>
            {rooms.length > 0 && (
              <div className="px-4 py-2.5 bg-gray-50/70 border-b border-gray-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!!batchUpload}
                    onClick={() => batchPhotosRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setBatchDragMode('photos'); }}
                    onDragLeave={() => setBatchDragMode(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setBatchDragMode(null);
                      if (e.dataTransfer.files?.length) handleBatchRoomUpload('photos', e.dataTransfer.files);
                    }}
                    className={`px-2.5 py-2 rounded-lg border border-dashed text-[11px] font-medium text-center transition-colors disabled:opacity-50 ${
                      batchDragMode === 'photos'
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {batchUpload?.mode === 'photos'
                      ? `Fotos ${batchUpload.done}/${batchUpload.total}${batchUpload.pct > 0 ? ` (${batchUpload.pct}%)` : ''}…`
                      : 'Soltar fotos por nombre'}
                  </button>
                  <button
                    type="button"
                    disabled={!!batchUpload}
                    onClick={() => batchToursRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setBatchDragMode('tours'); }}
                    onDragLeave={() => setBatchDragMode(null)}
                    onDrop={e => {
                      e.preventDefault();
                      setBatchDragMode(null);
                      if (e.dataTransfer.files?.length) handleBatchRoomUpload('tours', e.dataTransfer.files);
                    }}
                    className={`px-2.5 py-2 rounded-lg border border-dashed text-[11px] font-medium text-center transition-colors disabled:opacity-50 ${
                      batchDragMode === 'tours'
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                    }`}
                  >
                    {batchUpload?.mode === 'tours'
                      ? `360° ${batchUpload.done}/${batchUpload.total}${batchUpload.pct > 0 ? ` (${batchUpload.pct}%)` : ''}…`
                      : 'Soltar 360° por nombre'}
                  </button>
                </div>
                {batchUpload && (
                  <div className="h-1 w-full bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-900 transition-[width] duration-150"
                      style={{ width: `${Math.max(8, batchUpload.pct)}%` }}
                    />
                  </div>
                )}
              </div>
            )}
            {batchUnmatched.length > 0 && (
              <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-amber-800 font-medium">
                  <span>{batchUnmatched.length} {batchUnmatched.length === 1 ? 'archivo sin coincidencia' : 'archivos sin coincidencia'} — elegí el ambiente</span>
                  <button type="button" onClick={() => setBatchUnmatched([])} className="underline">
                    Descartar
                  </button>
                </div>
                <div className="space-y-1.5">
                  {batchUnmatched.map(item => (
                    <div key={item.url} className="flex items-center gap-2 p-1.5 rounded-lg bg-white border border-amber-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.url} alt="" className="w-9 h-9 rounded object-cover shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="m-0 text-[11px] text-gray-700 truncate" title={item.name}>{item.name}</p>
                        <p className="m-0 text-[10px] text-gray-400">{item.mode === 'tours' ? 'Panorámica 360°' : 'Foto'}</p>
                      </div>
                      <select
                        value=""
                        aria-label={`Asignar ${item.name} a ambiente`}
                        onChange={e => e.target.value && assignUnmatchedToRoom(item, e.target.value)}
                        className="h-7 px-2 text-[11px] border border-gray-200 rounded-md bg-white outline-none focus:ring-2 focus:ring-brand-500 max-w-[125px]"
                      >
                        <option value="">Asignar…</option>
                        {rooms.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="divide-y divide-gray-100">
              {rooms.map((r, i) => {
                const isActive = r.id === activeId;
                const pointCount = points[r.id]?.length ?? 0;
                const photoCount = (r.imageUrl ? 1 : 0) + (r.images?.length ?? 0);
                const linkedNode = unitTourData?.nodes.find(n => n.id === r.tourNodeId);
                return (
                  <div key={r.id} className={`transition-colors ${isActive ? 'bg-brand-50/40' : ''}`}>
                    <div className="px-4 py-3 flex items-center gap-2.5">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <button
                        type="button"
                        onClick={() => setActiveId(isActive ? null : r.id)}
                        className="font-medium text-gray-900 text-sm text-left flex-1 min-w-0 flex items-center gap-2 flex-wrap"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="flex items-center gap-1 text-[10.5px] font-normal">
                          {photoCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">
                              {photoCount} {photoCount === 1 ? 'foto' : 'fotos'}
                            </span>
                          )}
                          {linkedNode?.imageUrl && (
                            <span className="px-1.5 py-0.5 rounded bg-brand-100 text-brand-800">360°</span>
                          )}
                          {roomPlanImage && pointCount >= 3 && (
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">Plano</span>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveId(isActive ? null : r.id)}
                        className="text-xs text-gray-500 hover:text-gray-800 px-1.5 py-0.5"
                      >
                        {isActive ? 'Cerrar' : 'Editar'}
                      </button>
                      <button type="button" onClick={() => handleDeleteRoom(r.id)} className="text-xs text-red-700 hover:text-red-800">
                        Borrar
                      </button>
                    </div>

                    {isActive && (
                      <div className="px-4 pb-4 pt-1 pl-9 space-y-2.5">
                        <input
                          defaultValue={r.name}
                          onBlur={e => e.target.value !== r.name && e.target.value.trim() && handleRenameRoom(r.id, { name: e.target.value.trim() })}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                          placeholder="Nombre"
                        />
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-gray-500">Foto del ambiente</p>
                          <ImageUploader value={r.imageUrl ?? ''} onChange={url => handleRoomPhotos(r.id, { imageUrl: url || undefined })} folder="units" />
                        </div>
                        <MultiImageUploader
                          label="Más fotos de este ambiente"
                          values={r.images ?? []}
                          onChange={urls => handleRoomPhotos(r.id, { images: urls.length ? urls : undefined })}
                          folder="units"
                        />
                        <div className="space-y-1">
                          <p className="text-[11px] font-medium text-gray-500">Panorámica 360°</p>
                          <ImageUploader value={linkedNode?.imageUrl ?? ''} onChange={url => handleRoomPanoramaUpload(r, url)} folder="tours" />
                        </div>
                        {(unitTourData?.nodes.length ?? 0) > 0 && (
                          <select
                            value={r.tourNodeId ?? ''}
                            onChange={e => handleRenameRoom(r.id, { tourNodeId: e.target.value || undefined })}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                          >
                            <option value="">— o vincular a un nodo ya cargado —</option>
                            {(unitTourData?.nodes ?? []).map(n => (
                              <option key={n.id} value={n.id}>{n.name}</option>
                            ))}
                          </select>
                        )}
                        {roomPlanImage && <p className="text-xs text-gray-400">{pointCount} {pointCount === 1 ? 'punto' : 'puntos'} en el plano</p>}

                        {roomPlanImage && (
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => handleClear(r.id)} disabled={pointCount === 0} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors">
                              Vaciar
                            </button>
                            <button type="button" onClick={() => handleSaveShape(r.id)} disabled={savingShape || pointCount < 3} className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto">
                              {savingShape ? 'Guardando...' : 'Guardar forma'}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {rooms.length === 0 && (
                <div className="p-6 text-center space-y-2.5">
                  <p className="m-0 text-gray-500 text-sm">Todavía no hay ambientes cargados.</p>
                  <button
                    type="button"
                    onClick={handleSuggestRooms}
                    className="inline-flex items-center h-8 px-3.5 rounded-lg bg-gray-900 text-white text-xs font-medium hover:bg-gray-800 transition-colors"
                  >
                    Sugerir ambientes desde ficha
                  </button>
                </div>
              )}
            </div>

            <div className="p-4 bg-gray-50/50 flex gap-2">
              <input
                value={newRoomName}
                onChange={e => setNewRoomName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddRoom(); } }}
                placeholder="Nuevo ambiente (ej: Dormitorio)"
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <button onClick={handleAddRoom} className="shrink-0 text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap">
                + Agregar
              </button>
            </div>
          </div>
      </div>
    </m.div>
  );
}
