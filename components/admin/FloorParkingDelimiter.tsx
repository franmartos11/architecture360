'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { ParkingSpot } from '@/types';

type Point = { x: number; y: number };

// Fila de unidad tal como la devuelve el listado global de /api/admin/units
// (enriquecido con edificio/piso) — acá hacen falta las de TODOS los pisos
// del edificio, porque la cochera del subsuelo es de un depto del piso 7.
type ParkingUnitRow = Pick<DbUnitRow, 'id' | 'code' | 'floor_id' | 'garage_spaces' | 'parking_spots'> & {
  floor_number: number | null;
  building_id: string | null;
};

// Una cochera mientras se la está editando en pantalla. `savedUnitId` es la
// unidad bajo la que quedó guardada la última vez (vacío si todavía no se
// guardó): sin eso, reasignar una cochera a otro depto dejaría una copia
// colgada en el depto anterior.
type WorkingSpot = {
  key: string;
  unitId: string;
  savedUnitId: string;
  label: string;
  polygon: Point[];
};

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const NEW_SPOT_COLOR = '#f59e0b';

let spotSeq = 0;
const nextKey = () => `spot-${++spotSeq}`;

// Marcado masivo de cocheras sobre el plano de un piso de tipo Cochera: se
// dibuja cada espacio y se elige de un desplegable a qué departamento le
// toca. La cochera se guarda en la UNIDAD dueña (units.parking_spots), no en
// el piso — el piso solo aporta el plano sobre el que se dibuja.
export default function FloorParkingDelimiter({ buildingId, floorId }: { buildingId: string; floorId: string }) {
  const { unitLabel } = useProjectTypeConfig();
  const unitLabelLower = unitLabel.toLowerCase();
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [units, setUnits] = useState<ParkingUnitRow[]>([]);
  const [spots, setSpots] = useState<WorkingSpot[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [pendingSaveKey, setPendingSaveKey] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch('/api/admin/units').then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setPlanImage(floor?.plan_image ?? null);

      const all: ParkingUnitRow[] = Array.isArray(unitsData) ? unitsData : [];
      const ofBuilding = all
        .filter(u => u.building_id === buildingId)
        .sort((a, b) => (a.floor_number ?? 0) - (b.floor_number ?? 0) || a.code.localeCompare(b.code));
      setUnits(ofBuilding);

      // Solo las cocheras dibujadas sobre ESTE piso; las que cada depto
      // tenga en otro subsuelo ni se tocan ni se muestran acá.
      const working: WorkingSpot[] = [];
      for (const u of ofBuilding) {
        for (const spot of u.parking_spots ?? []) {
          if (spot.floorId !== floorId) continue;
          working.push({
            key: nextKey(),
            unitId: u.id,
            savedUnitId: u.id,
            label: spot.label ?? '',
            polygon: spot.polygon ?? [],
          });
        }
      }
      setSpots(working);
      setActiveKey(working[0]?.key ?? null);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(load, [buildingId, floorId]);

  const unitById = useMemo(() => new Map(units.map(u => [u.id, u])), [units]);

  const shapes: PolygonShape[] = useMemo(
    () => spots.map((s, i) => ({
      id: s.key,
      label: s.label || unitById.get(s.unitId)?.code || 'Cochera nueva',
      points: s.polygon,
      color: s.unitId ? PALETTE[i % PALETTE.length] : NEW_SPOT_COLOR,
    })),
    [spots, unitById]
  );

  const handlePointsChange = (key: string, points: Point[]) => {
    setSpots(prev => prev.map(s => (s.key === key ? { ...s, polygon: points } : s)));
  };

  // Lista completa de cocheras que le corresponde guardar a una unidad: las
  // que tenga en OTROS pisos se conservan tal cual (nunca se pisa lo que se
  // cargó desde otro subsuelo) + las de este piso que estén dibujadas.
  const buildParkingSpots = (unitId: string, working: WorkingSpot[]): ParkingSpot[] => {
    const stored = units.find(u => u.id === unitId)?.parking_spots ?? [];
    const otherFloors = stored.filter(s => s.floorId !== floorId);
    const onThisFloor = working
      .filter(s => s.unitId === unitId && s.polygon.length >= 3)
      .map((s): ParkingSpot => ({
        floorId,
        ...(s.label.trim() ? { label: s.label.trim() } : {}),
        polygon: s.polygon,
      }));
    return [...otherFloors, ...onThisFloor];
  };

  // Guarda las unidades afectadas (la dueña nueva y, si hubo reasignación, la
  // anterior) y refleja el resultado en el estado local.
  const persist = async (unitIds: string[], working: WorkingSpot[]): Promise<boolean> => {
    const targets = [...new Set(unitIds.filter(Boolean))];
    const payloads = targets.map(id => ({ id, parkingSpots: buildParkingSpots(id, working) }));
    const results = await Promise.all(
      payloads.map(p =>
        fetch(`/api/admin/units/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ parkingSpots: p.parkingSpots }),
        })
      )
    );
    if (results.some(r => !r.ok)) return false;
    setUnits(prev => prev.map(u => {
      const payload = payloads.find(p => p.id === u.id);
      return payload ? { ...u, parking_spots: payload.parkingSpots } : u;
    }));
    return true;
  };

  const handleSave = async (key: string) => {
    const spot = spots.find(s => s.key === key);
    if (!spot) return;
    if (!spot.unitId) {
      // No es un error: es el paso que falta después de dibujar el espacio.
      toast(`Ahora elegí a qué ${unitLabelLower} pertenece esta cochera.`);
      return;
    }
    if (spot.polygon.length < 3) {
      toast('Marcá primero la forma de la cochera sobre el plano.', 'error');
      return;
    }
    setSavingKey(key);
    const ok = await persist([spot.unitId, spot.savedUnitId], spots);
    setSavingKey(null);
    if (!ok) {
      toast('Error al guardar la cochera.', 'error');
      return;
    }
    setSpots(prev => prev.map(s => (s.key === key ? { ...s, savedUnitId: s.unitId } : s)));
    toast('Cochera guardada.');
  };

  // Elegir el depto es el último paso de la carga: si la forma ya está
  // dibujada, se guarda sola y se puede pasar a la siguiente cochera.
  const handleAssign = async (key: string, unitId: string) => {
    const next = spots.map(s => (s.key === key ? { ...s, unitId } : s));
    setSpots(next);
    const spot = next.find(s => s.key === key);
    if (!spot || !unitId || spot.polygon.length < 3) return;
    setSavingKey(key);
    const ok = await persist([unitId, spot.savedUnitId], next);
    setSavingKey(null);
    if (!ok) {
      toast('Error al guardar la cochera.', 'error');
      return;
    }
    setSpots(prev => prev.map(s => (s.key === key ? { ...s, savedUnitId: unitId } : s)));
    toast('Cochera guardada.');
  };

  const handleDelete = async (key: string) => {
    const spot = spots.find(s => s.key === key);
    if (!spot) return;
    const next = spots.filter(s => s.key !== key);
    if (spot.savedUnitId) {
      setSavingKey(key);
      const ok = await persist([spot.savedUnitId], next);
      setSavingKey(null);
      if (!ok) {
        toast('Error al borrar la cochera.', 'error');
        return;
      }
      toast('Cochera borrada.');
    }
    setSpots(next);
    if (activeKey === key) setActiveKey(next[next.length - 1]?.key ?? null);
  };

  // PolygonCanvas avisa que la forma quedó terminada ("Listo", Escape, o
  // soltar el rectángulo) en el MISMO evento en que manda los puntos
  // nuevos, así que en ese momento `spots` todavía no los tiene. Se agenda
  // el guardado y se dispara en el efecto siguiente, ya con el estado al día.
  const handleComplete = (key: string) => setPendingSaveKey(key);

  useEffect(() => {
    if (!pendingSaveKey) return;
    void (async () => {
      await handleSave(pendingSaveKey);
      setPendingSaveKey(null);
    })();
    // handleSave se recrea en cada render: la dependencia real es "hay una
    // cochera agendada para guardar".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSaveKey]);

  const handleAdd = () => {
    const spot: WorkingSpot = { key: nextKey(), unitId: '', savedUnitId: '', label: '', polygon: [] };
    setSpots(prev => [...prev, spot]);
    setActiveKey(spot.key);
  };

  if (loading) return <LoadingSpinner text="Cargando plano de cocheras..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano de cocheras." onRetry={load} />;

  if (!planImage) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        Este piso todavía no tiene un plano cargado — subilo primero en la pantalla del edificio y volvé a marcar las cocheras acá.
      </div>
    );
  }
  if (units.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        Este edificio todavía no tiene {unitLabelLower}s cargadas — sin ellas no hay a quién asignarle una cochera.
      </div>
    );
  }

  // Cuántas cocheras tiene marcadas cada depto en todo el edificio (las de
  // este piso, en vivo, + las que tenga en otros subsuelos ya guardadas).
  const markedCount = (unitId: string) =>
    spots.filter(s => s.unitId === unitId && s.polygon.length >= 3).length +
    (unitById.get(unitId)?.parking_spots ?? []).filter(s => s.floorId !== floorId).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6 items-start">
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
        <PolygonCanvas
          imageUrl={planImage}
          shapes={shapes}
          activeId={activeKey}
          mode={mode}
          onPointsChange={handlePointsChange}
          onComplete={handleComplete}
        />
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between gap-2">
            <h3 className="font-semibold text-gray-900 text-sm">
              Cocheras marcadas <span className="text-gray-400 font-normal">({spots.filter(s => s.polygon.length >= 3).length})</span>
            </h3>
            <button
              onClick={handleAdd}
              className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 text-white rounded-lg transition-colors whitespace-nowrap"
            >
              + Agregar cochera
            </button>
          </div>

          {spots.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-gray-400">
              Todavía no marcaste ninguna cochera en este piso. Tocá <strong>Agregar cochera</strong>, dibujá el espacio sobre el plano y elegí de qué {unitLabelLower} es.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {spots.map((s, i) => {
                const isActive = s.key === activeKey;
                const owner = unitById.get(s.unitId);
                const declared = owner?.garage_spaces ?? 0;
                const marked = s.unitId ? markedCount(s.unitId) : 0;
                return (
                  <div key={s.key} className={`p-4 ${isActive ? 'bg-brand-50/50' : ''}`}>
                    <button
                      onClick={() => setActiveKey(s.key)}
                      className="w-full flex items-center gap-2 text-left mb-2"
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: s.unitId ? PALETTE[i % PALETTE.length] : NEW_SPOT_COLOR }}
                      />
                      <span className="font-medium text-gray-900 text-sm truncate">
                        {s.label || (owner ? `Cochera de ${owner.code}` : 'Cochera sin asignar')}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto shrink-0">
                        {s.polygon.length >= 3 ? `${s.polygon.length} puntos` : 'sin dibujar'}
                      </span>
                    </button>

                    {isActive && (
                      <div className="pl-5 space-y-2.5">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-500 mb-1" htmlFor={`spot-unit-${s.key}`}>
                            ¿De qué {unitLabelLower} es?
                          </label>
                          <select
                            id={`spot-unit-${s.key}`}
                            value={s.unitId}
                            onChange={e => handleAssign(s.key, e.target.value)}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                          >
                            <option value="">Elegir {unitLabelLower}...</option>
                            {units.map(u => (
                              <option key={u.id} value={u.id}>
                                {u.floor_number != null ? `Piso ${u.floor_number} · ` : ''}{u.code}
                              </option>
                            ))}
                          </select>
                          {!!owner && declared > 0 && marked > declared && (
                            <p className="text-[11px] text-amber-600 mt-1">
                              {owner.code} tiene {declared} cochera{declared === 1 ? '' : 's'} declarada{declared === 1 ? '' : 's'} en su ficha y ya marcaste {marked}.
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-[11px] font-medium text-gray-500 mb-1" htmlFor={`spot-label-${s.key}`}>
                            Etiqueta (opcional)
                          </label>
                          <input
                            id={`spot-label-${s.key}`}
                            type="text"
                            value={s.label}
                            maxLength={30}
                            placeholder="Ej. C-12"
                            onChange={e => setSpots(prev => prev.map(w => (w.key === s.key ? { ...w, label: e.target.value } : w)))}
                            className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleDelete(s.key)}
                            disabled={savingKey === s.key}
                            className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-red-600 rounded-lg transition-colors"
                          >
                            Borrar
                          </button>
                          <button
                            onClick={() => handleSave(s.key)}
                            disabled={savingKey === s.key || !s.unitId || s.polygon.length < 3}
                            className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto"
                          >
                            {savingKey === s.key ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400 px-1">
          Las cocheras que un {unitLabelLower} tenga marcadas en otro subsuelo no se muestran acá y no se tocan al guardar.
        </p>
      </div>
    </div>
  );
}
