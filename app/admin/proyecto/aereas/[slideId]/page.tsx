'use client';

import { useState, useEffect, use, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import PolygonCanvas, { type PolygonShape } from '@/components/admin/PolygonCanvas';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';

interface BuildingRow {
  id: string;
  slug: string;
  name: string;
}
interface SlideRow {
  id: string;
  image_url: string;
  label: string;
}
interface HotspotRow {
  id: string;
  slide_id: string;
  building_id: string;
  x: number;
  y: number;
  polygon: { x: number; y: number }[] | null;
}

const PALETTE = ['#37463f', '#968676', '#3b82f6', '#e11d48', '#059669', '#d97706', '#7c3aed', '#0891b2'];

function centroid(points: { x: number; y: number }[]) {
  return {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };
}

export default function AdminAerialSlidePolygonsPage({ params }: { params: Promise<{ slideId: string }> }) {
  const { slideId } = use(params);
  const searchParams = useSearchParams();
  const preselectBuildingId = searchParams.get('building');

  const [slide, setSlide] = useState<SlideRow | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [hotspots, setHotspots] = useState<HotspotRow[]>([]);
  const [points, setPoints] = useState<Record<string, { x: number; y: number }[]>>({});
  const [pinOverrides, setPinOverrides] = useState<Record<string, { x: number; y: number } | null>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mode, setMode] = useState<'point' | 'rectangle' | 'pin'>('rectangle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        const s = (data.slides ?? []).find((sl: SlideRow) => sl.id === slideId) ?? null;
        setSlide(s);
        const b: BuildingRow[] = data.buildings ?? [];
        setBuildings(b);
        const h: HotspotRow[] = (data.hotspots ?? []).filter((hs: HotspotRow) => hs.slide_id === slideId);
        setHotspots(h);
        setPoints(Object.fromEntries(b.map(building => {
          const hotspot = h.find(hs => hs.building_id === building.id);
          return [building.id, hotspot?.polygon ?? []];
        })));
        setPinOverrides(Object.fromEntries(b.map(building => {
          const hotspot = h.find(hs => hs.building_id === building.id);
          return [building.id, hotspot ? { x: hotspot.x, y: hotspot.y } : null];
        })));
        if (b.length > 0) {
          const preselected = preselectBuildingId && b.some(building => building.id === preselectBuildingId)
            ? preselectBuildingId
            : b[0].id;
          setActiveId(prev => prev ?? preselected);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [slideId]);

  const shapes: PolygonShape[] = useMemo(
    () => buildings.map((b, i) => ({
      id: b.id,
      label: b.name,
      points: points[b.id] ?? [],
      color: PALETTE[i % PALETTE.length],
    })),
    [buildings, points]
  );

  const handlePointsChange = (id: string, newPoints: { x: number; y: number }[]) => {
    setPoints(prev => ({ ...prev, [id]: newPoints }));
  };

  const handleSave = async (buildingId: string) => {
    const shapePoints = points[buildingId] ?? [];
    const manualPin = pinOverrides[buildingId];
    const hasPolygon = shapePoints.length >= 3;
    if (!hasPolygon && !manualPin) return;
    setSavingId(buildingId);

    const existing = hotspots.find(h => h.building_id === buildingId);
    const pos = manualPin ?? centroid(shapePoints);
    const payload: { x: number; y: number; polygon?: { x: number; y: number }[] } = { x: pos.x, y: pos.y };
    if (hasPolygon) payload.polygon = shapePoints;

    const res = existing
      ? await fetch(`/api/admin/aerial-hotspots/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/aerial-hotspots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, slideId, buildingId }),
        });

    setSavingId(null);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
    if (res.ok) load();
  };

  const handleClear = (id: string) => setPoints(prev => ({ ...prev, [id]: [] }));

  if (loading) return <LoadingSpinner text="Cargando vista aérea..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar la vista aérea." onRetry={load} />;
  if (!slide) return <ErrorState message="Vista aérea no encontrada." />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Delimitar torres — {slide.label}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elegí un edificio de la lista y marcá su silueta en la foto. En <strong>Rectángulo</strong> arrastrá de esquina a esquina; en <strong>Forma libre</strong> hacé click para ir marcando el contorno y tocá el primer punto para cerrarlo — cualquier punto se puede arrastrar para ajustarlo, doble click lo borra. El pin (📍) se ubica solo en el centro de la silueta — usá <strong>Pin</strong> para arrastrarlo a mano, o doble click sobre el pin para volver al automático. Si te equivocás, "Deshacer" (o Ctrl/Cmd+Z) vuelve un paso atrás.
        </p>
      </div>

      {buildings.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Todavía no hay edificios cargados — creá alguno primero en "Edificios".
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
              <button
                onClick={() => setMode('pin')}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${mode === 'pin' ? 'bg-white text-gray-900 shadow' : 'text-gray-500 hover:text-gray-700'}`}
              >
                📍 Pin
              </button>
            </div>
            <PolygonCanvas
              imageUrl={slide.image_url}
              shapes={shapes}
              activeId={activeId}
              mode={mode}
              onPointsChange={handlePointsChange}
              onComplete={handleSave}
              pinPoint={activeId ? (pinOverrides[activeId] ?? (points[activeId]?.length >= 3 ? centroid(points[activeId]) : null)) : null}
              onPinPlace={point => activeId && setPinOverrides(prev => ({ ...prev, [activeId]: point }))}
            />
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 text-sm">Edificios</h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
              {buildings.map((b, i) => {
                const isActive = b.id === activeId;
                const pointCount = points[b.id]?.length ?? 0;
                return (
                  <div key={b.id} className={`p-4 ${isActive ? 'bg-brand-50/50' : ''}`}>
                    <div className="w-full flex items-center gap-2 mb-2">
                      <button onClick={() => setActiveId(b.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                        <span className="font-medium text-gray-900 text-sm truncate">{b.name}</span>
                      </button>
                      <span className="text-xs text-gray-400 shrink-0">{pointCount} {pointCount === 1 ? 'punto' : 'puntos'}</span>
                      <Link href={`/admin/edificios/${b.id}`} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">
                        Editar →
                      </Link>
                    </div>
                    {isActive && (
                      <div className="flex items-center gap-2 pl-5">
                        <button onClick={() => handleClear(b.id)} disabled={pointCount === 0} className="text-xs px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 rounded-lg transition-colors">
                          Vaciar
                        </button>
                        <button
                          onClick={() => handleSave(b.id)}
                          disabled={savingId === b.id || (pointCount < 3 && !pinOverrides[b.id])}
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
      )}
    </div>
  );
}
