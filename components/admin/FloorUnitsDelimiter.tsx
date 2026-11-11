'use client';

import { useState, useEffect, useMemo, useRef, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape, type PolygonCanvasApi } from '@/components/admin/PolygonCanvas';
import { PlanSkeleton } from '@/components/admin/PanelSkeletons';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { getStatusColor, pluralize } from '@/lib/units';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import type { UnitRow as DbUnitRow } from '@/types/database';

type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'status' | 'polygon'> & Partial<Pick<DbUnitRow, 'type' | 'total_area' | 'bedrooms'>>;
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
  const typeConfig = useProjectTypeConfig();
  const { unitLabel, buildingLabel, hasFloorStep } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  // "este piso" para edificios; "esta etapa / este dúplex" para los que no tienen pisos.
  const container = hasFloorStep ? 'este piso' : `${buildingAgreement(typeConfig).esta} ${buildingLabelLower}`;
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
  // Deshacer desde la barra de herramientas propia (el canvas expone su historial).
  const canvasApi = useRef<PolygonCanvasApi | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  // Opciones del pin (color/estilo) plegadas: la lista queda compacta como en el diseño.
  const [pinOpenId, setPinOpenId] = useState<string | null>(null);

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
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
      // Adentro de cada forma: "3 dorm. · 112 m²" (lo que haya cargado).
      sublabel: [u.bedrooms ? `${u.bedrooms} dorm.` : null, u.total_area ? `${u.total_area} m²` : null].filter(Boolean).join(' · ') || undefined,
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
      toast(data.unitsUpdated > 0 ? `Delimitación copiada a ${data.unitsUpdated} ${data.unitsUpdated === 1 ? unitLabelLower : pluralize(unitLabelLower)}.` : `No se encontraron ${pluralize(unitLabelLower)} con código equivalente en ese piso.`);
      setCopySourceFloorId('');
      load();
    } else {
      toast('Error al copiar la delimitación.', 'error');
    }
  };

  // Atajos (diseño): R rectángulo · F forma libre · Supr/Backspace borra la
  // forma activa. ⌘/Ctrl+Z ya lo maneja el canvas. Nada de esto corre
  // mientras se escribe en un campo.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'r') { e.preventDefault(); setMode('rectangle'); }
      else if (k === 'f') { e.preventDefault(); setMode('point'); }
      else if ((k === 'delete' || k === 'backspace') && activeId) { e.preventDefault(); setPoints(prev => ({ ...prev, [activeId]: [] })); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId]);

  if (loading) return <PlanSkeleton />;
  if (loadError) return <ErrorState message="No se pudo cargar el plano." onRetry={load} />;

  const emptyBox = 'rounded-2xl border border-dashed border-gray-300 bg-white/60 p-10 text-center text-[13px] text-gray-600';
  if (!planImage) {
    return (
      <div className={emptyBox}>
        {hasFloorStep
          ? 'Este piso todavía no tiene un plano cargado — agregalo primero en la pantalla del edificio.'
          : `${container[0].toUpperCase()}${container.slice(1)} todavía no tiene su plano — subilo primero en los datos ${buildingAgreement(typeConfig).del} ${buildingLabelLower}.`}
      </div>
    );
  }
  if (units.length === 0) {
    return (
      <div className={emptyBox}>
        {container[0].toUpperCase()}{container.slice(1)} todavía no tiene {pluralize(unitLabelLower)} — cargalas primero en la pestaña de {pluralize(unitLabel)}.
      </div>
    );
  }

  const drawnCount = units.filter(u => (points[u.id]?.length ?? 0) >= 3).length;
  const activeUnit = units.find(u => u.id === activeId) ?? null;
  // El aviso apunta a la primera que falta (la activa si es una de ellas).
  const firstUndrawn = activeUnit && (points[activeUnit.id]?.length ?? 0) < 3
    ? activeUnit
    : units.find(u => (points[u.id]?.length ?? 0) < 3) ?? null;
  const planFileName = decodeURIComponent((planImage.split('?')[0].split('/').pop() ?? 'plano')).slice(-40);
  const toolBtn = (on: boolean) => `min-h-[36px] px-3.5 rounded-lg text-[13px] transition-colors ${on ? 'bg-white/15 text-white font-semibold' : 'text-[#C9C6BE] hover:text-white'}`;
  const STATUS_LABEL: Record<string, string> = { available: 'Disponible', reserved: 'Reservada', sold: 'Vendida' };

  // Diseño "Planta y delimitación": el plano en una tarjeta con la barra
  // de herramientas oscura flotando arriba, y a la derecha la lista de
  // unidades del piso con su estado de dibujo, el aviso de la que falta y
  // los atajos.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-5 items-start">
      <div className="flex flex-col gap-3 min-w-0">
        {siblingFloors.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-[14px] border border-gray-200 bg-white px-4 py-3">
            <p className="m-0 text-xs leading-relaxed text-gray-600 flex-1">¿Mismo layout que otro piso ya delimitado? Copiá sus formas y pines en vez de redibujarlos.</p>
            <div className="flex gap-2 shrink-0">
              <select
                value={copySourceFloorId}
                onChange={e => setCopySourceFloorId(e.target.value)}
                aria-label="Piso de referencia"
                className="min-h-[40px] text-[13px] border border-gray-300 bg-white rounded-[10px] px-2.5 outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-500/30"
              >
                <option value="">Copiar de…</option>
                {siblingFloors.sort((a, b) => a.number - b.number).map(f => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
              <button
                onClick={handleCopyDelimitation}
                disabled={!copySourceFloorId || copyingDelimitation}
                className="min-h-[40px] px-3.5 text-[13px] font-semibold border border-gray-300 bg-white hover:border-gray-400 disabled:opacity-40 text-gray-900 rounded-[10px] whitespace-nowrap"
              >
                {copyingDelimitation ? 'Copiando...' : 'Copiar'}
              </button>
            </div>
          </div>
        )}

        <div className="relative rounded-2xl border border-gray-200 bg-white p-3 sm:p-4" style={{ backgroundImage: 'radial-gradient(#E4E0D8 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
          <div className="relative z-10 mx-auto mb-3 w-fit max-w-full flex flex-wrap justify-center gap-0.5 p-1 rounded-xl bg-gray-900 shadow-[0_8px_24px_rgba(23,25,26,0.25)]" role="toolbar" aria-label="Herramientas de dibujo">
            <button type="button" onClick={() => setMode('rectangle')} aria-pressed={mode === 'rectangle'} className={toolBtn(mode === 'rectangle')}>Rectángulo</button>
            <button type="button" onClick={() => setMode('point')} aria-pressed={mode === 'point'} className={toolBtn(mode === 'point')}>Forma libre</button>
            <button type="button" onClick={() => setMode('pin')} aria-pressed={mode === 'pin'} className={toolBtn(mode === 'pin')}>Mover pin</button>
            <span aria-hidden className="w-px my-1.5 bg-white/15" />
            <button type="button" onClick={() => canvasApi.current?.undo()} disabled={!canUndo} className={`${toolBtn(false)} disabled:opacity-40 disabled:hover:text-[#C9C6BE]`} title="Deshacer (⌘Z)">Deshacer</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} title="Reemplazar el plano"
              className="inline-flex items-center gap-1.5 min-h-[30px] px-2.5 rounded-full bg-white border border-gray-200 text-[11px] text-gray-700 hover:border-gray-300 max-w-full">
              <span className="truncate">{planFileName}</span><span className="text-gray-400">·</span><span className="font-semibold text-gray-900">reemplazar</span>
            </Link>
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
            showLabels
            apiRef={canvasApi}
            onCanUndoChange={setCanUndo}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="m-0 font-display text-[17px] font-semibold tracking-[-0.02em] text-gray-900">{pluralize(unitLabel)} {hasFloorStep ? 'del piso' : ''}</h3>
          <span className="text-xs text-gray-600">{drawnCount} de {units.length} dibujad{unitAgreeSuffix(typeConfig)}s</span>
        </div>
        <div className="flex flex-col gap-2 lg:max-h-[62vh] lg:overflow-y-auto">
          {units.map((u, i) => {
            const isActive = u.id === activeId;
            const pointCount = points[u.id]?.length ?? 0;
            const drawn = pointCount >= 3;
            const meta = [u.type, u.total_area ? `${u.total_area} m²` : null].filter(Boolean).join(' · ');
            return (
              <div key={u.id} className={`rounded-xl bg-white transition-colors ${isActive ? 'border-[1.5px] border-gray-900' : drawn ? 'border border-gray-200' : 'border border-dashed border-gray-300'}`}>
                <button
                  onClick={() => setActiveId(u.id)}
                  aria-pressed={isActive}
                  className="w-full flex items-center gap-3 min-h-[56px] px-3.5 text-left"
                >
                  <span className="w-4 h-4 rounded shrink-0 border border-black/10" style={{ background: drawn ? PALETTE[i % PALETTE.length] : '#F6E9D3' }} />
                  <span className="flex-1 min-w-0 flex flex-col">
                    <span className="font-display text-[15px] font-semibold text-gray-900">{u.code}</span>
                    {meta && <span className="text-[11px] text-gray-600 truncate">{meta}</span>}
                  </span>
                  <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${drawn ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-700'}`}>
                    {drawn ? (STATUS_LABEL[u.status] ?? 'Dibujada') : 'Sin dibujar'}
                  </span>
                </button>
                {isActive && (
                  <div className="px-3.5 pb-3.5 pt-1 flex flex-col gap-3 border-t border-gray-200">
                    <button type="button" onClick={() => setPinOpenId(o => (o === u.id ? null : u.id))} aria-expanded={pinOpenId === u.id}
                      className="self-start mt-2 min-h-[30px] inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 hover:text-gray-900">
                      <span aria-hidden className={`transition-transform ${pinOpenId === u.id ? 'rotate-90' : ''}`}>›</span> Pin
                    </button>
                    {pinOpenId === u.id && (<>
                    <div>
                      <p className="m-0 text-[11px] font-medium text-gray-600 mb-1.5">Color del pin</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setPinColors(prev => ({ ...prev, [u.id]: undefined }))}
                          title="Automático (según estado de la unidad)"
                          aria-label="Color automático según estado"
                          className={`w-6 h-6 rounded-full shrink-0 bg-gradient-to-br from-green-400 via-yellow-400 to-red-400 ${!pinColors[u.id] ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                        />
                        {MARKER_COLORS.map(c => (
                          <button
                            key={c}
                            onClick={() => setPinColors(prev => ({ ...prev, [u.id]: c }))}
                            title={c}
                            aria-label={`Color ${c}`}
                            style={{ background: c }}
                            className={`w-6 h-6 rounded-full shrink-0 ${pinColors[u.id] === c ? 'ring-2 ring-offset-1 ring-gray-900' : ''}`}
                          />
                        ))}
                        <label
                          title="Color personalizado"
                          className="relative w-6 h-6 rounded-full shrink-0 border border-dashed border-gray-300 flex items-center justify-center cursor-pointer overflow-hidden text-gray-500 text-[11px]"
                        >
                          +
                          <input
                            type="color"
                            aria-label="Color personalizado"
                            value={pinColors[u.id] ?? '#000000'}
                            onChange={e => setPinColors(prev => ({ ...prev, [u.id]: e.target.value }))}
                            className="absolute inset-0 opacity-0 cursor-pointer"
                          />
                        </label>
                      </div>
                    </div>

                    <div>
                      <p className="m-0 text-[11px] font-medium text-gray-600 mb-1.5">Estilo del pin</p>
                      <div className="grid grid-cols-2 p-[3px] rounded-[10px] bg-[#EAE7E0] gap-0.5">
                        <button
                          onClick={() => setPinStyles(prev => ({ ...prev, [u.id]: 'pill' }))}
                          className={`min-h-[32px] px-2 rounded-lg text-xs ${(pinStyles[u.id] ?? 'pill') === 'pill' ? 'bg-white font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                          Con nombre
                        </button>
                        <button
                          onClick={() => setPinStyles(prev => ({ ...prev, [u.id]: 'dot' }))}
                          className={`min-h-[32px] px-2 rounded-lg text-xs ${pinStyles[u.id] === 'dot' ? 'bg-white font-semibold text-gray-900' : 'text-gray-600 hover:text-gray-900'}`}
                        >
                          Punto
                        </button>
                      </div>
                    </div>
                    </>)}

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleClear(u.id)}
                        disabled={pointCount === 0}
                        className="min-h-[36px] px-3 text-xs font-medium border border-gray-300 bg-white hover:border-gray-400 disabled:opacity-40 text-gray-900 rounded-lg"
                      >
                        Borrar forma
                      </button>
                      <button
                        onClick={() => handleSave(u.id)}
                        disabled={savingId === u.id || (pointCount < 3 && !pinOverrides[u.id])}
                        className="min-h-[36px] px-3.5 text-xs font-semibold bg-gray-900 hover:bg-black disabled:opacity-40 text-white rounded-lg ml-auto"
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

        {firstUndrawn && (
          <div className="px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-200 flex flex-col gap-2">
            <p className="m-0 text-xs leading-relaxed text-amber-800">
              <b>{firstUndrawn.code}</b> todavía no tiene forma. Sin ella, el comprador no la puede tocar en el plano del sitio.
            </p>
            {firstUndrawn.id !== activeId || mode === 'pin' ? (
              <button type="button" onClick={() => { setActiveId(firstUndrawn.id); setMode('rectangle'); }}
                className="self-start min-h-[34px] px-3 rounded-lg bg-white border border-amber-200 text-xs font-semibold text-amber-800 hover:border-amber-300">
                Dibujar {firstUndrawn.code}
              </button>
            ) : (
              <span className="text-[11px] text-amber-800">Dibujala sobre el plano con la herramienta de arriba.</span>
            )}
          </div>
        )}

        <div className="px-3.5 py-3 rounded-xl border border-gray-200 bg-white flex flex-col gap-1">
          <span className="text-[13px] font-semibold text-gray-900">Cómo se dibuja</span>
          <span className="text-xs leading-relaxed text-gray-600">
            Rectángulo: arrastrá de una esquina a la otra. Forma libre: click en cada esquina y Listo (o Escape). Doble click borra un punto.
          </span>
          <span className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[11px] text-gray-600">
            <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-900">R</kbd> rectángulo</span>
            <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-900">F</kbd> forma libre</span>
            <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-900">⌘Z</kbd> deshacer</span>
            <span><kbd className="font-sans px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-900">Supr</kbd> borrar forma</span>
          </span>
        </div>
      </div>

      {orphanDots.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-white overflow-hidden lg:col-start-2">
          <div className="px-4 py-3 border-b border-amber-200 bg-amber-50">
            <h3 className="m-0 font-semibold text-amber-800 text-[13px]">Pines huérfanos</h3>
            <p className="m-0 text-xs text-amber-800 mt-0.5">
              Estos aparecen como &quot;?&quot; en el sitio público — no coinciden con ningún {unitLabelLower} cargado. Se pueden borrar.
            </p>
          </div>
          <div className="divide-y divide-gray-100">
            {orphanDots.map(d => (
              <div key={d.unitId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-6 h-6 rounded-full bg-gray-200 border-2 border-dashed border-gray-400 flex items-center justify-center text-gray-500 text-[10px] font-bold shrink-0">?</span>
                <span className="text-gray-500 truncate">id: {d.unitId}</span>
                <button
                  onClick={() => handleDeleteOrphan(d.unitId)}
                  className="min-h-[32px] text-xs font-semibold text-red-700 underline underline-offset-2 ml-auto shrink-0"
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

/** "dibujada"/"dibujado" según el género de unitLabel (Unidad → a, Lote → o). */
function unitAgreeSuffix(config: { unitLabelGender: 'm' | 'f' }) {
  return config.unitLabelGender === 'f' ? 'a' : 'o';
}
