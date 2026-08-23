'use client';

import { useState, useEffect, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FloorUnitsDelimiter from '@/components/admin/FloorUnitsDelimiter';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import type { UnitRow as DbUnitRow } from '@/types/database';

type UnitRow = Pick<DbUnitRow, 'id' | 'code'>;

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

export default function AdminFloorPlanPolygonsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);

  const [buildingName, setBuildingName] = useState('');
  const [floorLabel, setFloorLabel] = useState('');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<'deptos' | 'ambientes'>('deptos');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      setBuildingName(buildingData.building?.name ?? '');
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setFloorLabel(floor?.label ?? '');
      const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
      setUnits(list);
      if (list.length > 0) setActiveId(prev => prev ?? list[0].id);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  }, [buildingId, floorId]);

  if (loading) return <LoadingSpinner text="Cargando plano..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." />;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName} · {floorLabel}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Delimitar deptos en el plano</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elegí un depto de la lista. En <strong>Rectángulo</strong> arrastrá de una esquina a la otra y listo. En <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá el primer punto para cerrarlo — sirve para ambientes con más de 4 lados, incluso arrancando de un rectángulo ya hecho. Arrastrá cualquier punto para ajustarlo (incluso mientras lo estás dibujando), doble click para borrarlo. El pin (📍) con el nombre del depto se ubica solo en el centro de la silueta — usá <strong>Pin</strong> para arrastrarlo a mano, o doble click sobre el pin para volver al automático. Si te equivocás, "Deshacer" (o Ctrl/Cmd+Z) vuelve un paso atrás.
        </p>
      </div>

      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setView('deptos')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'deptos' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Deptos en el piso
        </button>
        <button
          onClick={() => setView('ambientes')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'ambientes' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Ambientes del depto
        </button>
      </div>

      {view === 'deptos' ? (
        <FloorUnitsDelimiter buildingId={buildingId} floorId={floorId} />
      ) : units.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Este piso todavía no tiene unidades — cargalas primero en la pestaña de Unidades.
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {units.map((u, i) => {
              const isActive = u.id === activeId;
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveId(u.id)}
                  className={`flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    isActive ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                  {u.code}
                </button>
              );
            })}
          </div>
          {activeId && <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={activeId} />}
        </div>
      )}
    </div>
  );
}
