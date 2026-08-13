'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import type { UnitRow as DbUnitRow } from '@/types/database';

type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'status' | 'polygon'>;

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

export default function AdminFloorPlanPolygonsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);

  const [buildingName, setBuildingName] = useState('');
  const [floorLabel, setFloorLabel] = useState('');
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }[]>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      setBuildingName(buildingData.building?.name ?? '');
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setFloorLabel(floor?.label ?? '');
      setPlanImage(floor?.plan_image ?? null);

      const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
      setUnits(list);
      setPoints(Object.fromEntries(list.map(u => [u.id, u.polygon ?? []])));
      if (list.length > 0) setActiveId(list[0].id);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(load, [buildingId, floorId]);

  const shapes: PolygonShape[] = useMemo(
    () => units.map((u, i) => ({
      id: u.id,
      label: u.code,
      points: points[u.id] ?? [],
      color: PALETTE[i % PALETTE.length],
    })),
    [units, points]
  );

  const handlePointsChange = (id: string, newPoints: { x: number; y: number }[]) => {
    setPoints(prev => ({ ...prev, [id]: newPoints }));
  };

  const handleSave = async (id: string) => {
    setSavingId(id);
    const res = await fetch(`/api/admin/units/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ polygon: points[id] ?? [] }),
    });
    setSavingId(null);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
    if (res.ok) {
      setUnits(prev => prev.map(u => (u.id === id ? { ...u, polygon: points[id] ?? [] } : u)));
    }
  };

  const handleClear = (id: string) => {
    setPoints(prev => ({ ...prev, [id]: [] }));
  };

  if (loading) return <LoadingSpinner text="Cargando plano..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName} · {floorLabel}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Delimitar deptos en el plano</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elegí un depto de la lista. En <strong>Rectángulo</strong> arrastrá de una esquina a la otra y listo. En <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá el primer punto para cerrarlo — sirve para ambientes con más de 4 lados, incluso arrancando de un rectángulo ya hecho. Arrastrá cualquier punto para ajustarlo (incluso mientras lo estás dibujando), doble click para borrarlo. Si te equivocás, "Deshacer" (o Ctrl/Cmd+Z) vuelve un paso atrás.
        </p>
      </div>

      {!planImage ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Este piso todavía no tiene un plano cargado — agregalo primero en la pantalla del edificio.
        </div>
      ) : units.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Este piso todavía no tiene unidades — cargalas primero en la pestaña de Unidades.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
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
            <PolygonCanvas imageUrl={planImage} shapes={shapes} activeId={activeId} mode={mode} onPointsChange={handlePointsChange} onComplete={handleSave} />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Deptos</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {units.map((u, i) => {
                const isActive = u.id === activeId;
                const pointCount = points[u.id]?.length ?? 0;
                return (
                  <div key={u.id} className={`p-4 ${isActive ? 'bg-brand-50/50' : ''}`}>
                    <button
                      onClick={() => setActiveId(u.id)}
                      className="w-full flex items-center gap-2 text-left mb-2"
                    >
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                      <span className="font-medium text-gray-900 text-sm">{u.code}</span>
                      <span className="text-xs text-gray-400 ml-auto">{pointCount} {pointCount === 1 ? 'punto' : 'puntos'}</span>
                    </button>
                    {isActive && (
                      <div className="flex items-center gap-2 pl-5">
                        <button
                          onClick={() => handleClear(u.id)}
                          disabled={pointCount === 0}
                          className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors"
                        >
                          Vaciar
                        </button>
                        <button
                          onClick={() => handleSave(u.id)}
                          disabled={savingId === u.id || pointCount < 3}
                          className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto"
                        >
                          {savingId === u.id ? 'Guardando...' : 'Guardar'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
