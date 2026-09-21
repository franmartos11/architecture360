'use client';

import { useState, useEffect, useRef, use, useMemo, startTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTransitionRouter } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import type {
  BuildingRow as DbBuildingRow, AerialSlideRow, AerialHotspotRow,
} from '@/types/database';

type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name'>;
type SlideRow = Pick<AerialSlideRow, 'id' | 'image_url' | 'label'>;
type HotspotRow = Pick<AerialHotspotRow, 'id' | 'slide_id' | 'building_id' | 'x' | 'y' | 'polygon'>;
type Point = { x: number; y: number };

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

function centroid(points: Point[]) {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

// Todo lo que se edita (puntos y pin) se indexa por slide + edificio a la
// vez, no solo por edificio: con varias aéreas abiertas en la misma
// pantalla, cada combinación slide×edificio tiene su propio dibujo.
function keyOf(slideId: string, buildingId: string) {
  return `${slideId}::${buildingId}`;
}

export default function AdminAerialSlidePolygonsPage({ params }: { params: Promise<{ slideId: string }> }) {
  const { slideId: initialSlideId } = use(params);
  const searchParams = useSearchParams();
  const initialBuildingId = searchParams.get('building');
  const typeConfig = useProjectTypeConfig();
  const { un } = buildingAgreement(typeConfig);
  const buildingLabelLower = typeConfig.buildingLabel.toLowerCase();
  const aerialLower = typeConfig.aerialLabel.toLowerCase();
  const router = useTransitionRouter();
  const toast = useToast();

  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [hotspots, setHotspots] = useState<HotspotRow[]>([]);
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [pinOverrides, setPinOverrides] = useState<Record<string, Point | null>>({});
  // Qué combinaciones slide×edificio tienen algo dibujado/movido que
  // todavía no se mandó al servidor. Se limpia al guardar (uno por uno o
  // con "Guardar todo").
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  // Contador de ediciones por combinación slide×edificio — NO es estado
  // (no necesita re-render), es para poder comparar "¿se editó esta forma
  // de nuevo mientras el guardado que ya mandé todavía estaba en vuelo?".
  // Sin esto, un guardado que responde tarde podía limpiar `dirty` de una
  // edición más nueva que nunca se mandó (ver handleSave/handleSaveAll).
  const editVersionRef = useRef<Record<string, number>>({});
  const bumpVersion = (key: string) => {
    editVersionRef.current[key] = (editVersionRef.current[key] ?? 0) + 1;
  };

  // La aérea y el edificio activos NO están atados a la URL de React: son
  // estado de la página, para poder saltar de una aérea a otra sin
  // navegar ni remontar el componente (eso es lo que hoy pierde el
  // edificio activo y los cambios sin guardar). La URL se actualiza aparte,
  // más abajo, solo para que los links existentes sigan funcionando.
  const [activeSlideId, setActiveSlideId] = useState<string | null>(initialSlideId);
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(initialBuildingId);
  const [mode, setMode] = useState<'point' | 'rectangle' | 'pin'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingAll, setSavingAll] = useState(false);

  const hasUnsavedChanges = Object.values(dirty).some(Boolean);

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        const s: SlideRow[] = data.slides ?? [];
        setSlides(s);
        const b: BuildingRow[] = data.buildings ?? [];
        setBuildings(b);
        const h: HotspotRow[] = data.hotspots ?? [];
        setHotspots(h);
        setPoints(Object.fromEntries(
          s.flatMap(slide => b.map(building => {
            const hotspot = h.find(hs => hs.slide_id === slide.id && hs.building_id === building.id);
            return [keyOf(slide.id, building.id), hotspot?.polygon ?? []];
          }))
        ));
        setPinOverrides(Object.fromEntries(
          s.flatMap(slide => b.map(building => {
            const hotspot = h.find(hs => hs.slide_id === slide.id && hs.building_id === building.id);
            return [keyOf(slide.id, building.id), hotspot ? { x: hotspot.x, y: hotspot.y } : null];
          }))
        ));
        setDirty({});
        if (b.length > 0) {
          setActiveBuildingId(prev => (prev && b.some(building => building.id === prev)) ? prev : b[0].id);
        }
        if (s.length > 0) {
          setActiveSlideId(prev => (prev && s.some(slide => slide.id === prev)) ? prev : s[0].id);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  // Se pide una sola vez: ya no depende de qué aérea está activa, así que
  // cambiar de aérea no dispara un refetch.
  useEffect(load, []);

  // La URL sigue reflejando la aérea (y el edificio) activos, para que los
  // links que ya existen a esta pantalla sigan armándose igual — pero se
  // actualiza con history.replaceState en vez de navegar: así no se
  // remonta la página ni se pierde el estado en memoria al saltar de aérea.
  useEffect(() => {
    if (!activeSlideId) return;
    const url = activeBuildingId
      ? `/admin/proyecto/aereas/${activeSlideId}?building=${activeBuildingId}`
      : `/admin/proyecto/aereas/${activeSlideId}`;
    window.history.replaceState(null, '', url);
  }, [activeSlideId, activeBuildingId]);

  // Avisar antes de salir si hay algo sin guardar: cubre cerrar/recargar
  // la pestaña o tipear otra URL. La navegación interna (los dos links de
  // "salir" de esta pantalla) se maneja aparte con guardedNavigate.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  function guardedNavigate(href: string) {
    if (hasUnsavedChanges && !window.confirm('Hay cambios sin guardar. ¿Salir igual?')) return;
    router.push(href);
  }

  const activeSlide = slides.find(s => s.id === activeSlideId) ?? null;

  const shapes: PolygonShape[] = useMemo(
    () => activeSlideId
      ? buildings.map((b, i) => ({
          id: b.id,
          label: b.name,
          points: points[keyOf(activeSlideId, b.id)] ?? [],
          color: PALETTE[i % PALETTE.length],
        }))
      : [],
    [buildings, points, activeSlideId]
  );

  const handlePointsChange = (buildingId: string, newPoints: Point[]) => {
    if (!activeSlideId) return;
    const key = keyOf(activeSlideId, buildingId);
    setPoints(prev => ({ ...prev, [key]: newPoints }));
    setDirty(prev => ({ ...prev, [key]: true }));
    bumpVersion(key);
  };

  // Arma, para una combinación slide+edificio, el payload a mandar al
  // servidor (o null si no hay nada guardable todavía) — lo usan tanto el
  // guardado individual como "Guardar todo".
  function buildPayload(slideId: string, buildingId: string) {
    const key = keyOf(slideId, buildingId);
    const shapePoints = points[key] ?? [];
    const manualPin = pinOverrides[key];
    const hasPolygon = shapePoints.length >= 3;
    if (!hasPolygon && !manualPin) return null;
    const pos = manualPin ?? centroid(shapePoints);
    const payload: { x: number; y: number; polygon?: Point[] } = { x: pos.x, y: pos.y };
    if (hasPolygon) payload.polygon = shapePoints;
    return payload;
  }

  const handleSave = async (buildingId: string) => {
    if (!activeSlideId) return;
    const key = keyOf(activeSlideId, buildingId);
    const payload = buildPayload(activeSlideId, buildingId);
    if (!payload) return;
    // Versión de esta forma en el momento justo de armar el payload que se
    // manda: si al volver la respuesta la versión cambió, es porque el
    // usuario la siguió editando (ej. cerrar la forma dispara onComplete →
    // handleSave, y justo después arrastra un vértice) — en ese caso NO hay
    // que limpiar "dirty", porque lo que se guardó ya quedó desactualizado.
    const versionAtSave = editVersionRef.current[key] ?? 0;
    setSavingId(buildingId);

    const existing = hotspots.find(h => h.slide_id === activeSlideId && h.building_id === buildingId);
    const res = existing
      ? await fetch(`/api/admin/aerial-hotspots/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/aerial-hotspots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, slideId: activeSlideId, buildingId }),
        });

    setSavingId(null);
    if (res.ok) {
      const saved: HotspotRow = await res.json();
      // Actualiza el estado local con lo que devolvió el servidor en vez de
      // volver a pedir todo el proyecto: con varias aéreas abiertas, ese
      // refetch pisaría cambios sin guardar de las otras.
      setHotspots(prev => {
        const others = prev.filter(h => !(h.slide_id === activeSlideId && h.building_id === buildingId));
        return [...others, saved];
      });
      if ((editVersionRef.current[key] ?? 0) === versionAtSave) {
        setDirty(prev => ({ ...prev, [key]: false }));
      }
      toast('Guardado.');
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const handleSaveAll = async () => {
    // Igual que en handleSave: se anota la versión de cada forma en el
    // momento de armar la tanda, para no limpiar "dirty" de una edición que
    // llegó después de que el payload ya había salido.
    const versionAtSave: Record<string, number> = {};
    const items = slides.flatMap(slide =>
      buildings.flatMap(building => {
        const key = keyOf(slide.id, building.id);
        if (!dirty[key]) return [];
        const payload = buildPayload(slide.id, building.id);
        if (!payload) return [];
        versionAtSave[key] = editVersionRef.current[key] ?? 0;
        return [{ slideId: slide.id, buildingId: building.id, ...payload }];
      })
    );
    if (items.length === 0) return;
    setSavingAll(true);

    const res = await fetch('/api/admin/aerial-hotspots/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });

    if (res.ok) {
      const { results } = await res.json() as {
        results: { slideId: string; buildingId: string; success: boolean; data: HotspotRow | null; error: string | null }[];
      };
      const okResults = results.filter(r => r.success && r.data);
      setHotspots(prev => {
        let next = prev;
        for (const r of okResults) {
          next = [...next.filter(h => !(h.slide_id === r.slideId && h.building_id === r.buildingId)), r.data as HotspotRow];
        }
        return next;
      });
      setDirty(prev => {
        const next = { ...prev };
        for (const r of okResults) {
          const key = keyOf(r.slideId, r.buildingId);
          if ((editVersionRef.current[key] ?? 0) === versionAtSave[key]) delete next[key];
        }
        return next;
      });
      const failedCount = results.length - okResults.length;
      if (failedCount === 0) toast(`Guardado: ${okResults.length} ${okResults.length === 1 ? 'cambio' : 'cambios'}.`);
      else toast(`Se guardaron ${okResults.length} de ${results.length}. Revisá los que quedaron marcados.`, 'error');
    } else {
      toast('Error al guardar todo.', 'error');
    }
    setSavingAll(false);
  };

  const handleClear = (buildingId: string) => {
    if (!activeSlideId) return;
    const key = keyOf(activeSlideId, buildingId);
    setPoints(prev => ({ ...prev, [key]: [] }));
    setDirty(prev => ({ ...prev, [key]: true }));
    bumpVersion(key);
  };

  if (loading) return <LoadingSpinner text={`Cargando ${aerialLower}...`} tone="light" />;
  if (loadError) return <ErrorState message={`No se pudo cargar la ${aerialLower}.`} onRetry={load} />;
  if (!activeSlide) return <ErrorState message={`${typeConfig.aerialLabel} no encontrada.`} />;

  const activePinKey = activeSlideId && activeBuildingId ? keyOf(activeSlideId, activeBuildingId) : null;
  const activePinPoints = activePinKey ? points[activePinKey] ?? [] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button type="button" onClick={() => guardedNavigate('/admin/proyecto')} className="text-sm text-gray-500 hover:text-gray-700">
            ← Proyecto
          </button>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{typeConfig.hasUnitStep ? `Delimitar ${buildingLabelLower}s` : `Marcar la ${buildingLabelLower}`} — {activeSlide.label}</h2>
          <p className="text-sm text-gray-500 mt-1 max-w-3xl">
            Elegí {un} {buildingLabelLower} de la lista y marcá su silueta en la foto. En <strong>Rectángulo</strong> arrastrá de esquina a esquina; en <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá el primer punto para cerrarlo — cualquier punto se puede arrastrar para ajustarlo, doble click lo borra. El pin (📍) se ubica solo en el centro de la silueta — usá <strong>Pin</strong> para arrastrarlo a mano, o doble click sobre el pin para volver al automático. Si te equivocás, &quot;Deshacer&quot; (o Ctrl/Cmd+Z) vuelve un paso atrás. Saltá de una {aerialLower} a otra con la tira de abajo: el {buildingLabelLower} elegido y lo que vayas dibujando se mantienen.
          </p>
        </div>
        {hasUnsavedChanges && (
          <button
            type="button"
            onClick={handleSaveAll}
            // También deshabilitado mientras hay un guardado individual en
            // vuelo: si no, "Guardar todo" podría mandar el mismo
            // slide+edificio que ya está guardándose por su cuenta, y como
            // aerial_hotspots no tiene constraint único ahí, los dos
            // guardados podrían decidir INSERT y duplicar la fila.
            disabled={savingAll || savingId !== null}
            className="shrink-0 h-9 px-4 flex items-center gap-2 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {savingAll ? 'Guardando todo...' : `Guardar todo (${Object.values(dirty).filter(Boolean).length})`}
          </button>
        )}
      </div>

      {buildings.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Todavía no hay {buildingLabelLower}s cargados — creá alguno primero en &quot;{typeConfig.buildingLabel}s&quot;.
        </div>
      ) : (
        <>
          {/* Tira de vistas aéreas del proyecto: saltar de una a otra no navega
              ni remonta la página (activeSlideId es estado local), así que el
              edificio activo y los cambios sin guardar de TODAS quedan intactos. */}
          {slides.length > 1 && (
            <div className="flex items-center gap-2.5 overflow-x-auto pb-1">
              {slides.map(slide => {
                const isActive = slide.id === activeSlideId;
                const markedCount = buildings.filter(b => hotspots.some(h => h.slide_id === slide.id && h.building_id === b.id)).length;
                const slideIsDirty = buildings.some(b => dirty[keyOf(slide.id, b.id)]);
                return (
                  <button
                    key={slide.id}
                    type="button"
                    onClick={() => setActiveSlideId(slide.id)}
                    className={`relative shrink-0 w-40 rounded-xl border-2 overflow-hidden text-left transition-colors ${isActive ? 'border-gray-900' : 'border-transparent hover:border-gray-300'}`}
                  >
                    <div
                      className="h-20 bg-cover bg-center bg-gray-100"
                      style={slide.image_url ? { backgroundImage: `url(${slide.image_url})` } : undefined}
                    />
                    {slideIsDirty && (
                      <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white" title="Cambios sin guardar" />
                    )}
                    <div className="px-2 py-1.5 bg-white">
                      <p className="text-xs font-medium text-gray-900 truncate">{slide.label}</p>
                      <p className="text-[11px] text-gray-400">{markedCount} de {buildings.length} marcados</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

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
                <button
                  onClick={() => setMode('pin')}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'pin' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  📍 Pin
                </button>
              </div>
              <PolygonCanvas
                imageUrl={activeSlide.image_url}
                shapes={shapes}
                activeId={activeBuildingId}
                mode={mode}
                onPointsChange={handlePointsChange}
                onComplete={handleSave}
                pinPoint={activeBuildingId ? (pinOverrides[activePinKey!] ?? (activePinPoints.length >= 3 ? centroid(activePinPoints) : null)) : null}
                onPinPlace={point => {
                  if (!activePinKey) return;
                  setPinOverrides(prev => ({ ...prev, [activePinKey]: point }));
                  setDirty(prev => ({ ...prev, [activePinKey]: true }));
                  bumpVersion(activePinKey);
                }}
              />
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900 text-sm">{typeConfig.buildingLabel}s</h3>
              </div>
              <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
                {buildings.map((b, i) => {
                  const isActive = b.id === activeBuildingId;
                  const key = activeSlideId ? keyOf(activeSlideId, b.id) : '';
                  const pointCount = points[key]?.length ?? 0;
                  const isDirty = !!dirty[key];
                  return (
                    <div key={b.id} className={`p-4 ${isActive ? 'bg-brand-50/50' : ''}`}>
                      <div className="w-full flex items-center gap-2 mb-2">
                        <button onClick={() => setActiveBuildingId(b.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="font-medium text-gray-900 text-sm truncate">{b.name}</span>
                        </button>
                        {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Cambios sin guardar" />}
                        <span className="text-xs text-gray-400 shrink-0">{pointCount} {pointCount === 1 ? 'punto' : 'puntos'}</span>
                        <button type="button" onClick={() => guardedNavigate(`/admin/edificios/${b.id}`)} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">
                          Editar →
                        </button>
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-2 pl-5">
                          <button onClick={() => handleClear(b.id)} disabled={pointCount === 0} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors">
                            Vaciar
                          </button>
                          <button
                            onClick={() => handleSave(b.id)}
                            // También deshabilitado mientras corre "Guardar
                            // todo" (mismo motivo que arriba: evitar que dos
                            // guardados en simultáneo decidan INSERT los dos
                            // para la misma fila slide+edificio).
                            disabled={savingId === b.id || savingAll || (pointCount < 3 && !pinOverrides[key])}
                            className="text-xs px-2.5 py-1 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-lg transition-colors ml-auto"
                          >
                            {savingId === b.id ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
