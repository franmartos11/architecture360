'use client';

import { useState, useEffect, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FloorUnitsDelimiter from '@/components/admin/FloorUnitsDelimiter';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import type { UnitRow as DbUnitRow } from '@/types/database';

type UnitRow = Pick<DbUnitRow, 'id' | 'code'>;

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

export default function AdminFloorPlanPolygonsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep, hasFloorStep, buildingLabel, unitLabel, unitIsLand } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  // casa: el edificio ES la unidad — no hay "unidades en el piso" que
  // delimitar, solo el plano y los ambientes de esa casa.
  const isSingleHouse = !hasFloorStep && !hasUnitStep;

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

  // ── casa: directo al plano + ambientes de la única unidad ──────────
  if (isSingleHouse) {
    return (
      <div className="space-y-6">
        <div>
          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← Datos {agree.del} {buildingLabel.toLowerCase()}</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Plano y ambientes {agree.del} {buildingLabel.toLowerCase()}</h2>
          <p className="text-sm text-gray-500 mt-1">
            Subí el plano 2D de cada planta y marcá el contorno de cada ambiente. En <strong>Rectángulo</strong> arrastrá de esquina a esquina; en <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá <strong>Listo</strong> (o Escape) cuando terminaste. Cada cambio se guarda solo.
          </p>
        </div>
        {units.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
            No se encontró la unidad de {agree.esta} {buildingLabel.toLowerCase()} — probá recargar.
          </div>
        ) : (
          <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={units[0].id} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName} · {floorLabel}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Delimitar {unitLabelLower}s en el plano</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elegí {uAgree.un} {unitLabelLower} de la lista y marcá su contorno sobre el plano. En <strong>Rectángulo</strong> arrastrá de una esquina a la otra. En <strong>Forma libre</strong> hacé click para ir marcando el contorno; cuando terminaste tocá <strong>Listo</strong> (o Escape) y queda guardado. Arrastrá cualquier punto para ajustarlo, doble click para borrarlo. El pin (📍) con el nombre se ubica solo en el centro — usá <strong>Pin</strong> para moverlo a mano. Si te equivocás, <strong>Deshacer</strong> (o Ctrl/Cmd+Z) vuelve un paso atrás.
        </p>
      </div>

      {/* Un lote no tiene "ambientes" — solo se delimita su silueta. El resto
          de los tipos sí (deptos, dúplex): solapa aparte para eso. */}
      {!unitIsLand && (
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          <button
            onClick={() => setView('deptos')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'deptos' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            {unitLabel}s{hasFloorStep ? ' en el piso' : ''}
          </button>
          <button
            onClick={() => setView('ambientes')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${view === 'ambientes' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Ambientes
          </button>
        </div>
      )}

      {view === 'deptos' || unitIsLand ? (
        <FloorUnitsDelimiter buildingId={buildingId} floorId={floorId} />
      ) : units.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Este piso todavía no tiene {unitLabelLower}s — cargalas primero en la pestaña de {unitLabel}s.
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
