'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { polygonCenter } from '@/lib/amenities';
import type { AmenityRow as DbAmenityRow } from '@/types/database';

type Point = { x: number; y: number };
type AmenityRow = Pick<DbAmenityRow, 'id' | 'name' | 'floor_id' | 'pin' | 'polygon' | 'images'>;

const AMENITY_COLOR = '#968676';
const ACTIVE_COLOR = '#047857';

// Ubica amenities del proyecto sobre el plano de un piso: silueta y/o pin.
// La ubicación se guarda en la AMENITY (amenities.floor_id/pin/polygon), no
// en el piso — una amenity vive en un solo piso, así que ubicarla acá la
// saca del piso donde estuviera antes.
export default function FloorAmenitiesDelimiter({ buildingId, floorId }: { buildingId: string; floorId: string }) {
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [amenities, setAmenities] = useState<AmenityRow[]>([]);
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [pins, setPins] = useState<Record<string, Point | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle' | 'pin'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pendingSave, setPendingSave] = useState<string | null>(null);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(withActiveProject('/api/admin/project', activeProjectId)).then(res => res.json()),
    ]).then(([buildingData, projectData]) => {
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setPlanImage(floor?.plan_image ?? null);
      const list: AmenityRow[] = projectData.amenities ?? [];
      setAmenities(list);
      const here = list.filter(a => a.floor_id === floorId);
      setPoints(Object.fromEntries(here.map(a => [a.id, a.polygon ?? []])));
      setPins(Object.fromEntries(here.map(a => [a.id, a.pin])));
      setActiveId(prev => prev ?? here[0]?.id ?? list[0]?.id ?? null);
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(load, [buildingId, floorId, activeProjectId]);

  const shapes: PolygonShape[] = useMemo(
    () => amenities
      .filter(a => a.id === activeId || (points[a.id]?.length ?? 0) > 0)
      .map(a => ({ id: a.id, label: a.name, points: points[a.id] ?? [], color: a.id === activeId ? ACTIVE_COLOR : AMENITY_COLOR })),
    [amenities, points, activeId]
  );

  const save = async (id: string, polygon: Point[], pin: Point | null) => {
    if (polygon.length < 3 && !pin) return;
    setSavingId(id);
    const res = await fetch(`/api/admin/amenities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floorId, polygon, pin }),
    }).catch(() => null);
    setSavingId(null);
    if (!res?.ok) {
      toast('Error al guardar la ubicación.', 'error');
      return;
    }
    setAmenities(prev => prev.map(a => (a.id === id ? { ...a, floor_id: floorId, polygon, pin } : a)));
    setPins(prev => ({ ...prev, [id]: pin }));
    toast('Ubicación guardada.');
  };

  const removeFromPlan = async (id: string) => {
    setSavingId(id);
    const res = await fetch(`/api/admin/amenities/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floorId: null, polygon: [], pin: null }),
    }).catch(() => null);
    setSavingId(null);
    if (!res?.ok) {
      toast('Error al quitarla del plano.', 'error');
      return;
    }
    setAmenities(prev => prev.map(a => (a.id === id ? { ...a, floor_id: null, polygon: null, pin: null } : a)));
    setPoints(prev => ({ ...prev, [id]: [] }));
    setPins(prev => ({ ...prev, [id]: null }));
    toast('Quitada del plano.');
  };

  // PolygonCanvas avisa "terminé" en el mismo evento en que manda los puntos
  // nuevos: el guardado se agenda y corre con el estado ya actualizado.
  useEffect(() => {
    if (!pendingSave) return;
    void (async () => {
      await save(pendingSave, points[pendingSave] ?? [], pins[pendingSave] ?? null);
      setPendingSave(null);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSave]);

  if (loading) return <LoadingSpinner text="Cargando plano..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." onRetry={load} />;

  if (!planImage) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        Este piso todavía no tiene un plano cargado — subilo primero y volvé a ubicar las amenities acá.
      </div>
    );
  }
  if (amenities.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        El proyecto todavía no tiene amenities. Cargalas en <Link href="/admin/proyecto/amenities" className="underline">Amenities</Link> y volvé a ubicarlas en el plano.
      </div>
    );
  }

  const activePolygon = activeId ? points[activeId] ?? [] : [];
  const activePin = activeId ? pins[activeId] ?? (activePolygon.length >= 3 ? polygonCenter(activePolygon) : null) : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
      <div className="space-y-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {([['rectangle', 'Rectángulo'], ['point', 'Forma libre'], ['pin', '📍 Pin']] as const).map(([m, label]) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === m ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <PolygonCanvas
          imageUrl={planImage}
          shapes={shapes}
          activeId={activeId}
          mode={mode}
          onPointsChange={(id, pts) => setPoints(prev => ({ ...prev, [id]: pts }))}
          onComplete={id => setPendingSave(id)}
          pinPoint={activePin}
          onPinPlace={point => {
            if (!activeId) return;
            setPins(prev => ({ ...prev, [activeId]: point }));
            if (point) void save(activeId, activePolygon, point);
          }}
          pinColor={AMENITY_COLOR}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900 text-sm">
            Amenities del proyecto{' '}
            <span className="text-gray-400 font-normal">({amenities.filter(a => a.floor_id === floorId).length} en este piso)</span>
          </h3>
        </div>
        <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
          {amenities.map(a => {
            const isActive = a.id === activeId;
            const here = a.floor_id === floorId;
            const elsewhere = !!a.floor_id && !here;
            return (
              <div key={a.id} className={`p-3.5 ${isActive ? 'bg-brand-50/50' : ''}`}>
                <button onClick={() => setActiveId(a.id)} className="w-full flex items-center gap-2.5 text-left">
                  <div className="w-10 h-8 rounded-md overflow-hidden bg-gray-100 shrink-0">
                    {a.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.images[0]} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <span className="font-medium text-gray-900 text-sm truncate flex-1">{a.name}</span>
                  <span className={`text-[11px] shrink-0 ${here ? 'text-emerald-700' : elsewhere ? 'text-amber-600' : 'text-gray-400'}`}>
                    {here ? 'en este piso' : elsewhere ? 'en otro piso' : 'sin ubicar'}
                  </span>
                </button>
                {isActive && (
                  <div className="mt-2.5 pl-[50px] space-y-2">
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      {elsewhere
                        ? 'Está ubicada en otro piso. Si la dibujás o le ponés el pin acá, se mueve a este piso.'
                        : 'Dibujá su silueta sobre el plano y/o ubicá el pin. Si solo dibujás la silueta, el pin va al centro.'}
                    </p>
                    {here && (
                      <button
                        onClick={() => removeFromPlan(a.id)}
                        disabled={savingId === a.id}
                        className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-red-600 rounded-lg transition-colors"
                      >
                        Quitar del plano
                      </button>
                    )}
                    {savingId === a.id && <p className="text-[11px] text-gray-400">Guardando…</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="px-5 py-3 border-t border-gray-100 text-[11px] text-gray-400">
          Las amenities de todo el complejo también se pueden ubicar en el piso de una torre (ej. un cowork en el piso 5).
        </p>
      </div>
    </div>
  );
}
