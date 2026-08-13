'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';

interface Room {
  id: string;
  name: string;
  tourNodeId?: string;
  polygon: { x: number; y: number }[];
}

const PALETTE = ['#83978c', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

function slugify(text: string): string {
  return text
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ambiente';
}

export default function AdminUnitRoomsPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);

  const [unitCode, setUnitCode] = useState('');
  const [roomPlanImage, setRoomPlanImage] = useState('');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingShape, setSavingShape] = useState(false);
  const [savingImage, setSavingImage] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/units/${unitId}`)
      .then(res => res.json())
      .then(unit => {
        setUnitCode(unit.code ?? '');
        setRoomPlanImage(unit.room_plan_image ?? '');
        const list: Room[] = unit.rooms ?? [];
        setRooms(list);
        setPoints(Object.fromEntries(list.map(r => [r.id, r.polygon ?? []])));
        setActiveId(prev => prev ?? list[0]?.id ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [unitId]);

  const persistRooms = async (nextRooms: Room[]) => {
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rooms: nextRooms }),
    });
    if (res.ok) {
      setRooms(nextRooms);
      return true;
    }
    toast('Error al guardar.', 'error');
    return false;
  };

  const handleSaveImage = async (url: string) => {
    setRoomPlanImage(url);
    setSavingImage(true);
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomPlanImage: url || null }),
    });
    setSavingImage(false);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
  };

  const handleAddRoom = async () => {
    if (!newRoomName.trim()) return;
    const id = slugify(newRoomName);
    if (rooms.some(r => r.id === id)) {
      toast('Ya existe un ambiente con ese nombre.', 'error');
      return;
    }
    const newRoom: Room = { id, name: newRoomName.trim(), polygon: [] };
    const ok = await persistRooms([...rooms, newRoom]);
    if (ok) {
      setPoints(prev => ({ ...prev, [id]: [] }));
      setActiveId(id);
      setNewRoomName('');
    }
  };

  const handleRenameRoom = async (id: string, updates: Partial<Pick<Room, 'name' | 'tourNodeId'>>) => {
    const next = rooms.map(r => (r.id === id ? { ...r, ...updates } : r));
    await persistRooms(next);
  };

  const handleDeleteRoom = async (id: string) => {
    if (!confirm('¿Borrar este ambiente?')) return;
    const next = rooms.filter(r => r.id !== id);
    const ok = await persistRooms(next);
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
    const ok = await persistRooms(next);
    setSavingShape(false);
    if (ok) toast('Guardado.');
  };

  const handleClear = (id: string) => setPoints(prev => ({ ...prev, [id]: [] }));

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
          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← Volver a unidades</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Ambientes — {unitCode}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Delimitá cada ambiente sobre el plano de la unidad — arrastrá cualquier punto para ajustarlo, doble click para borrarlo, "Deshacer" (o Ctrl/Cmd+Z) vuelve un paso atrás. El "Tour node id" es opcional y sirve para que, al tocar el ambiente en el sitio, salte directo a ese nodo del recorrido 360°.
          </p>
        </div>
        <Link
          href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/tour`}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          Recorrido 360° →
        </Link>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Plano de ambientes</h3>
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
                      <input
                        defaultValue={r.tourNodeId ?? ''}
                        onBlur={e => e.target.value !== (r.tourNodeId ?? '') && handleRenameRoom(r.id, { tourNodeId: e.target.value || undefined })}
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none font-mono"
                        placeholder="Tour node id (opcional)"
                      />
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
              <button onClick={handleAddRoom} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap">
                + Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
