'use client';

import { useState, useEffect, useMemo } from 'react';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { getStatusColor } from '@/lib/units';
import type { UnitRow as DbUnitRow } from '@/types/database';

type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'status' | 'polygon'>;
type UnitDot = { unitId: string; x: number; y: number; color?: string; style?: 'pill' | 'dot' };
type SiblingFloor = { id: string; number: number; label: string };

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];
const MARKER_COLORS = ['#22c55e', '#eab308', '#ef4444', '#3b82f6', '#8b5cf6', '#f97316', '#0ea5e9', '#ec4899'];

function centroid(points: { x: number; y: number }[]) {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

// Delimitador de polígono + pin de cada depto sobre el plano del piso — se
// usa tanto en su pantalla standalone (pisos/[floorId]/plano/page.tsx) como
// embebido dentro del wizard de carga guiada.
export default function FloorUnitsDelimiter({ buildingId, floorId }: { buildingId: string; floorId: string }) {
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [unitDots, setUnitDots] = useState<UnitDot[]>([]);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }[]>>({});
  const [pinOverrides, setPinOverrides] = useState<Record<string, { x: number; y: number } | null>>({});
  const [pinColors, setPinColors] = useState<Record<string, string | undefined>>({});
  const [pinStyles, setPinStyles] = useState<Record<string, 'pill' | 'dot' | undefined>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle' | 'pin'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [siblingFloors, setSiblingFloors] = useState<SiblingFloor[]>([]);
  const [copySourceFloorId, setCopySourceFloorId] = useState('');
  const [copyingDelimitation, setCopyingDelimitation] = useState(false);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setPlanImage(floor?.plan_image ?? null);
      const dots: UnitDot[] = floor?.unit_dots ?? [];
      setUnitDots(dots);
      setSiblingFloors((buildingData.floors ?? []).filter((f: SiblingFloor) => f.id !== floorId));

      const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
      setUnits(list);
      setPoints(Object.fromEntries(list.map(u => [u.id, u.polygon ?? []])));
      setPinOverrides(Object.fromEntries(list.map(u => {
        const dot = dots.find(d => d.unitId === u.code);
        return [u.id, dot ? { x: dot.x, y: dot.y } : null];
      })));
      setPinColors(Object.fromEntries(list.map(u => [u.id, dots.find(d => d.unitId === u.code)?.color])));
      setPinStyles(Object.fromEntries(list.map(u => [u.id, dots.find(d => d.unitId === u.code)?.style])));
      if (list.length > 0) setActiveId(prev => prev ?? list[0].id);
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
    const unit = units.find(u => u.id === id);
    if (!unit) return;
    const shapePoints = points[id] ?? [];
    const manualPin = pinOverrides[id];
    const hasPolygon = shapePoints.length >= 3;
    if (!hasPolygon && !manualPin) return;
    setSavingId(id);

    // El marcador público (floor.unit_dots) es un blob JSON sin FK — se
    // referencia por código de unidad (Unit.id en el sitio público es el
    // code, no el uuid de la fila) para que coincida con lo que arma
    // mapProject() en data/project-repository.ts.
    const pos = manualPin ?? centroid(shapePoints);
    const nextDots = [
      ...unitDots.filter(d => d.unitId !== unit.code),
      { unitId: unit.code, x: pos.x, y: pos.y, color: pinColors[id], style: pinStyles[id] },
    ];

    const [unitRes, floorRes] = await Promise.all([
      fetch(`/api/admin/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon: shapePoints }),
      }),
      fetch(`/api/admin/floors/${floorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unitDots: nextDots }),
      }),
    ]);

    setSavingId(null);
    if (unitRes.ok && floorRes.ok) {
      toast('Guardado.');
      setUnits(prev => prev.map(u => (u.id === id ? { ...u, polygon: shapePoints } : u)));
      setUnitDots(nextDots);
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const handleClear = (id: string) => {
    setPoints(prev => ({ ...prev, [id]: [] }));
  };

  // Pines de floor.unit_dots que apuntan a un unitId que ya no existe (unidad
  // borrada, o quedó de una carga vieja) — el visor público los muestra como
  // un "?" en vez del pin dorado con el nombre. Se pueden borrar acá.
  const orphanDots = unitDots.filter(d => !units.some(u => u.code === d.unitId));

  const handleDeleteOrphan = async (unitId: string) => {
    const nextDots = unitDots.filter(d => d.unitId !== unitId);
    const res = await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unitDots: nextDots }),
    });
    if (res.ok) {
      toast('Pin borrado.');
      setUnitDots(nextDots);
    } else {
      toast('Error al borrar.', 'error');
    }
  };

  // Copia polígono + pin de cada depto de otro piso de este edificio,
  // emparejando por código (con el número de piso remapeado) — para pisos
  // que ya tienen unidades cargadas pero no se crearon con "Duplicar piso".
  const handleCopyDelimitation = async () => {
    if (!copySourceFloorId) return;
    setCopyingDelimitation(true);
    const res = await fetch(`/api/admin/floors/${floorId}/copy-delimitation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceFloorId: copySourceFloorId }),
    });
    setCopyingDelimitation(false);
    if (res.ok) {
      const data = await res.json();
      toast(data.unitsUpdated > 0 ? `Delimitación copiada a ${data.unitsUpdated} depto${data.unitsUpdated === 1 ? '' : 's'}.` : 'No se encontraron deptos con código equivalente en ese piso.');
      setCopySourceFloorId('');
      load();
    } else {
      toast('Error al copiar la delimitación.', 'error');
    }
  };

  if (loading) return <LoadingSpinner text="Cargando plano..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." onRetry={load} />;

  if (!planImage) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        Este piso todavía no tiene un plano cargado — agregalo primero en la pantalla del edificio.
      </div>
    );
  }
  if (units.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
        Este piso todavía no tiene unidades — cargalas primero en la pestaña de Unidades.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">
      <div className="space-y-3">
        {siblingFloors.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500 flex-1">¿Este piso tiene el mismo layout que otro ya delimitado? Copiá los polígonos y pines en vez de redibujarlos.</p>
            <div className="flex gap-2 shrink-0">
              <select
                value={copySourceFloorId}
                onChange={e => setCopySourceFloorId(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Elegir piso de referencia...</option>
                {siblingFloors.sort((a, b) => a.number - b.number).map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button
                onClick={handleCopyDelimitation}
                disabled={!copySourceFloorId || copyingDelimitation}
                className="text-xs px-3 py-1.5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors whitespace-nowrap"
              >
                {copyingDelimitation ? 'Copiando...' : 'Copiar delimitación'}
              </button>
            </div>
          </div>
        )}
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
          <button
            onClick={() => setMode('pin')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'pin' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
          >
            📍 Pin
          </button>
        </div>
        <PolygonCanvas
          imageUrl={planImage}
          shapes={shapes}
          activeId={activeId}
          mode={mode}
          onPointsChange={handlePointsChange}
          onComplete={handleSave}
          pinPoint={activeId ? (pinOverrides[activeId] ?? (points[activeId]?.length >= 3 ? centroid(points[activeId]) : null)) : null}
          onPinPlace={point => activeId && setPinOverrides(prev => ({ ...prev, [activeId]: point }))}
          pinColor={activeId ? (pinColors[activeId] || getStatusColor(units.find(u => u.id === activeId)?.status ?? '')) : undefined}
        />
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
                  <div className="pl-5 space-y-2.5">
                    <div>
                      <p className="text-[11px] font-medium text-gray-500 mb-1">Color del pin</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setPinColors(prev => ({ ...prev, [u.id]: undefined }))}
                          title="Automático (según estado de la unidad)"
                          className={`w-5 h-5 rounded-full shrink-0 bg-gradient-to-br from-green-400 via-yellow-400 to-red-400 ${!pinColors[u.id] ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                        />
                        {MARKER_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setPinColors(prev => ({ ...prev, [u.id]: c }))}
                            title={c}
                            style={{ background: c }}
                            className={`w-5 h-5 rounded-full shrink-0 ${pinColors[u.id] === c ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                          />
                        ))}
                        <label
                          title="Color personalizado"
                          className="relative w-5 h-5 rounded-full shrink-0 border border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden text-gray-400 text-[10px]"
                        >
                          +
                          <input
                            type="color"
                            value={pinColors[u.id] ?? '#000000'}
                            onChange={e => setPinColors(prev => ({ ...prev, [u.id]: e.target.value }))}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-medium text-gray-500 mb-1">Estilo del pin</p>
                      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
                        <button
                          onClick={() => setPinStyles(prev => ({ ...prev, [u.id]: 'pill' }))}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${(pinStyles[u.id] ?? 'pill') === 'pill' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Pastilla con nombre
                        </button>
                        <button
                          onClick={() => setPinStyles(prev => ({ ...prev, [u.id]: 'dot' }))}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${pinStyles[u.id] === 'dot' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                          Punto simple
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleClear(u.id)}
                        disabled={pointCount === 0}
                        className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors"
                      >
                        Vaciar
                      </button>
                      <button
                        onClick={() => handleSave(u.id)}
                        disabled={savingId === u.id || (pointCount < 3 && !pinOverrides[u.id])}
                        className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto"
                      >
                        {savingId === u.id ? 'Guardando...' : 'Guardar'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {orphanDots.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-amber-200 overflow-hidden lg:col-start-2">
          <div className="px-5 py-3 border-b border-amber-100 bg-amber-50">
            <h3 className="font-semibold text-amber-900 text-sm">Pines huérfanos</h3>
            <p className="text-xs text-amber-700 mt-0.5">
              Estos aparecen como "?" en el sitio público — no coinciden con ningún depto cargado. Se pueden borrar.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {orphanDots.map(d => (
              <div key={d.unitId} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="w-6 h-6 rounded-full bg-gray-200 border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-500 text-[10px] font-bold shrink-0">?</span>
                <span className="text-gray-500 truncate">id: {d.unitId}</span>
                <button
                  onClick={() => handleDeleteOrphan(d.unitId)}
                  className="text-xs text-red-500 hover:text-red-700 ml-auto shrink-0"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
