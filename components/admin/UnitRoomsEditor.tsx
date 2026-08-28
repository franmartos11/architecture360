'use client';

import { useState, useEffect, useMemo } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { slugify } from '@/lib/slug';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import type { TourData, TourNode, Room, UnitLevel } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';

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
// (unidades/[unitId]/page.tsx) como embebido como pestaña dentro de
// "Delimitar deptos en el plano", para tener todo el flujo de delimitación
// (piso → depto → ambientes) en un mismo lugar.
//
// Cuando la unidad tiene más de una planta (floorsCount > 1, hoy solo
// posible en casa), arriba del plano aparece un selector de planta — cada
// una con su propio plano y sus propios ambientes delimitados encima.
export default function UnitRoomsEditor({ buildingId, floorId, unitId }: { buildingId: string; floorId: string; unitId: string }) {
  const typeConfig = useProjectTypeConfig();
  const { unitLabel } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const [unitCode, setUnitCode] = useState('');
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
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/units/${unitId}`)
      .then(res => res.json())
      .then(unit => {
        setUnitCode(unit.code ?? '');
        setUnitTourData(unit.tour_data ?? null);
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
        label: existing?.label ?? `Piso ${i + 1}`,
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
  // aplican a esta imagen).
  useEffect(() => {
    setPoints(Object.fromEntries(activeLevel.rooms.map(r => [r.id, r.polygon ?? []])));
    setActiveId(activeLevel.rooms[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLevelIdx, activeLevel.key]);

  // Unidades candidatas para "copiar diseño": cualquier otra unidad del
  // proyecto que ya tenga ambientes o recorrido 360° cargado.
  useEffect(() => {
    fetch('/api/admin/units')
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
  }, [unitId]);

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
    if (extra?.tourData !== undefined) setUnitTourData(extra.tourData as TourData);
    return true;
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

  // Subir una panorámica directo desde el ambiente crea (o actualiza) su
  // nodo en el recorrido 360° y lo vincula solo, sin pasar por la pantalla
  // separada de Recorrido ni por el <select> de sincronización manual. El
  // recorrido es único por unidad (no por planta), así que viaja aparte de
  // los rooms en el mismo PATCH.
  const handleRoomPanoramaUpload = async (room: Room, url: string) => {
    const currentTour = unitTourData ?? { initialNodeId: '', nodes: [] };
    const existingIdx = currentTour.nodes.findIndex(n => n.id === room.tourNodeId);
    let nextNodes: TourNode[];
    let nodeId = room.tourNodeId;

    if (existingIdx >= 0) {
      nextNodes = currentTour.nodes.map((n, i) => (i === existingIdx ? { ...n, imageUrl: url } : n));
    } else {
      const taken = new Set(currentTour.nodes.map(n => n.id));
      nodeId = room.id;
      let n = 2;
      while (taken.has(nodeId)) { nodeId = `${room.id}-${n}`; n++; }
      nextNodes = [...currentTour.nodes, { id: nodeId, name: room.name, imageUrl: url, initialView: { yaw: 0, pitch: 0, fov: Math.PI / 2 } }];
    }

    const nextTour: TourData = { initialNodeId: currentTour.initialNodeId || nodeId || '', nodes: nextNodes };
    const nextRooms = rooms.map(r => (r.id === room.id ? { ...r, tourNodeId: nodeId } : r));
    const ok = await persistLevel({ rooms: nextRooms }, { tourData: nextTour });
    if (ok) toast('Panorámica vinculada al ambiente.');
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

  if (loading) return <LoadingSpinner text="Cargando unidad..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar la unidad." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-900 tracking-tight">Ambientes — {unitCode}</h2>
            {rooms.length > 0 && (
              <span className={`text-xs font-medium rounded-full px-2.5 py-1 ${linkedRoomsCount === rooms.length ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {linkedRoomsCount}/{rooms.length} con recorrido 360°
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Delimitá cada ambiente sobre el plano {uAgree.del} {unitLabelLower} — arrastrá cualquier punto para ajustarlo, doble click para borrarlo, "Deshacer" (o Ctrl/Cmd+Z) vuelve un paso atrás. Subí la panorámica de cada ambiente ahí mismo, abajo, para crear su nodo del recorrido 360° automáticamente.
          </p>
        </div>
        <Link
          href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/tour`}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          Recorrido 360° →
        </Link>
      </div>

      {levels.length > 1 && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {levels.map((l, i) => (
            <button
              key={l.key}
              onClick={() => setActiveLevelIdx(i)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${activeLevelIdx === i ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {l.label}{!l.planImage && <span className="text-amber-500 ml-1">·</span>}
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

      {!roomPlanImage ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Cargá primero la URL del plano de ambientes de arriba para poder delimitarlos.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
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

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Ambientes</h3>
            </div>

            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {rooms.map((r, i) => {
                const isActive = r.id === activeId;
                const pointCount = points[r.id]?.length ?? 0;
                const linkedNode = unitTourData?.nodes.find(n => n.id === r.tourNodeId);
                return (
                  <div key={r.id} className={`p-4 ${isActive ? 'bg-brand-50/50' : ''}`}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <button onClick={() => setActiveId(r.id)} className="font-medium text-gray-900 text-sm text-left flex-1">
                        {r.name}
                      </button>
                      <button onClick={() => handleDeleteRoom(r.id)} className="text-xs text-red-500 hover:text-red-700">Borrar</button>
                    </div>

                    <div className="pl-5 space-y-2">
                      <input
                        defaultValue={r.name}
                        onBlur={e => e.target.value !== r.name && e.target.value.trim() && handleRenameRoom(r.id, { name: e.target.value.trim() })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                        placeholder="Nombre"
                      />
                      <div className="space-y-1">
                        <p className="text-[11px] font-medium text-gray-500">Panorámica 360°</p>
                        <ImageUploader value={linkedNode?.imageUrl ?? ''} onChange={url => handleRoomPanoramaUpload(r, url)} folder="tours" />
                      </div>
                      {(unitTourData?.nodes.length ?? 0) > 0 && (
                        <select
                          value={r.tourNodeId ?? ''}
                          onChange={e => handleRenameRoom(r.id, { tourNodeId: e.target.value || undefined })}
                          className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                        >
                          <option value="">— o vincular a un nodo ya cargado —</option>
                          {(unitTourData?.nodes ?? []).map(n => (
                            <option key={n.id} value={n.id}>{n.name}</option>
                          ))}
                        </select>
                      )}
                      <p className="text-xs text-gray-400">{pointCount} {pointCount === 1 ? 'punto' : 'puntos'}</p>

                      {isActive && (
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleClear(r.id)} disabled={pointCount === 0} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors">
                            Vaciar
                          </button>
                          <button onClick={() => handleSaveShape(r.id)} disabled={savingShape || pointCount < 3} className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto">
                            {savingShape ? 'Guardando...' : 'Guardar forma'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {rooms.length === 0 && (
                <div className="p-6 text-center text-gray-400 text-sm">Todavía no hay ambientes.</div>
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
      )}
    </div>
  );
}
