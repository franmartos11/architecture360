'use client';

import { useMemo, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import EmptyState from '@/components/ui/EmptyState';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { POI_CATEGORY_COLORS } from '@/lib/poiCategoryColors';
import type { PoiCategory } from '@/types';
import type { PointOfInterestRow } from '@/types/database';
import type { OverviewPoi } from '@/components/admin/LocationOverviewMap';

const LocationOverviewMap = dynamic(() => import('@/components/admin/LocationOverviewMap'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-gray-100 animate-pulse" />,
});

type PoiRow = Pick<PointOfInterestRow,
  | 'id' | 'name' | 'category' | 'description' | 'distance_label' | 'image'
  | 'latitude' | 'longitude' | 'walk_minutes' | 'drive_minutes' | 'bike_minutes' | 'sort_order'
>;

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  colegio: 'Colegio',
  salud: 'Salud',
  comercio: 'Comercio',
  transporte: 'Transporte',
  entretenimiento: 'Entretenimiento / club',
  otro: 'Otro',
};
const CATEGORIES = Object.keys(CATEGORY_LABELS) as PoiCategory[];

const EMPTY_FORM = {
  name: '',
  category: 'otro' as PoiCategory,
  description: '',
  distanceLabel: '',
  image: '',
  walkMinutes: '',
  driveMinutes: '',
  bikeMinutes: '',
};

function timePills(p: PoiRow) {
  const pills: { label: string; muted?: boolean }[] = [];
  if (p.drive_minutes) pills.push({ label: `auto ${p.drive_minutes}′` });
  if (p.walk_minutes) pills.push({ label: `cam ${p.walk_minutes}′` });
  if (p.bike_minutes) pills.push({ label: `bici ${p.bike_minutes}′` });
  if (!pills.length) pills.push({ label: 'sin tiempos', muted: true });
  return pills;
}

// Cuerpo de la pantalla de Ubicación, sin el header — compartido entre
// /admin/proyecto/ubicacion y el panel deslizable de /admin/sitio.
//
// Mapa único con todos los puntos + panel lateral con la lista y la
// edición inline: para ubicar un punto se selecciona (o se crea) y
// después se hace click en el mapa — evita abrir un picker chico por
// cada punto como antes.
export default function LocationEditor({ onSaved }: { onSaved?: () => void }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectCenter, setProjectCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [pois, setPois] = useState<PoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [filter, setFilter] = useState<'todos' | PoiCategory>('todos');
  const [byCategory, setByCategory] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [awaitingPlacement, setAwaitingPlacement] = useState(false);
  const [fitToken, setFitToken] = useState(0);

  const [draftName, setDraftName] = useState('');
  const [draftCat, setDraftCat] = useState<PoiCategory>('otro');
  const [creatingDraft, setCreatingDraft] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [calculatingTimes, setCalculatingTimes] = useState(false);

  const toast = useToast();
  const confirmDialog = useConfirm();

  // Sin resets sincrónicos: se usa directo como callback del efecto de
  // montaje (los valores iniciales de loading/loadError ya son los
  // correctos para esa primera carga).
  const fetchData = () => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setProjectId(data.project?.id ?? null);
        setProjectCenter(
          data.project?.latitude != null && data.project?.longitude != null
            ? { lat: data.project.latitude, lng: data.project.longitude }
            : null
        );
        setPois(data.pointsOfInterest ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetchData();
  };

  useEffect(fetchData, []);

  const visible = useMemo(() => {
    let list = filter === 'todos' ? pois.slice() : pois.filter(p => p.category === filter);
    if (byCategory) list = list.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    return list;
  }, [pois, filter, byCategory]);

  const placedCount = pois.filter(p => p.latitude != null).length;
  const missingTimes = pois.filter(p => p.latitude != null && !p.drive_minutes).length;

  const closeEdit = () => {
    setSelectedId(null);
    setAwaitingPlacement(false);
    setForm(EMPTY_FORM);
  };

  const openRow = (p: PoiRow) => {
    if (selectedId === p.id) { closeEdit(); return; }
    setSelectedId(p.id);
    setAwaitingPlacement(false);
    setForm({
      name: p.name,
      category: p.category,
      description: p.description ?? '',
      distanceLabel: p.distance_label ?? '',
      image: p.image ?? '',
      walkMinutes: p.walk_minutes != null ? String(p.walk_minutes) : '',
      driveMinutes: p.drive_minutes != null ? String(p.drive_minutes) : '',
      bikeMinutes: p.bike_minutes != null ? String(p.bike_minutes) : '',
    });
  };

  const handleSelectMarker = (id: string) => {
    const p = pois.find(x => x.id === id);
    if (p) openRow(p);
  };

  const handleAddDraft = async () => {
    const name = draftName.trim();
    if (!name || creatingDraft) return;
    setCreatingDraft(true);
    const res = await fetch('/api/admin/points-of-interest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, category: draftCat, sortOrder: pois.length }),
    });
    setCreatingDraft(false);
    if (!res.ok) { toast('Error al crear el punto de interés.', 'error'); return; }
    const created: PoiRow = await res.json();
    setDraftName('');
    setPois(prev => prev.concat([created]));
    setSelectedId(created.id);
    setAwaitingPlacement(true);
    setForm({ ...EMPTY_FORM, name: created.name, category: created.category });
    onSaved?.();
  };

  const handleLocate = (p: PoiRow) => {
    setSelectedId(p.id);
    setAwaitingPlacement(true);
    setForm({
      name: p.name,
      category: p.category,
      description: p.description ?? '',
      distanceLabel: p.distance_label ?? '',
      image: p.image ?? '',
      walkMinutes: p.walk_minutes != null ? String(p.walk_minutes) : '',
      driveMinutes: p.drive_minutes != null ? String(p.drive_minutes) : '',
      bikeMinutes: p.bike_minutes != null ? String(p.bike_minutes) : '',
    });
  };

  const handleMapClick = async (lat: number, lng: number) => {
    if (!awaitingPlacement || !selectedId) return;
    setAwaitingPlacement(false);
    const res = await fetch(`/api/admin/points-of-interest/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ latitude: lat, longitude: lng }),
    });
    if (res.ok) {
      const updated: PoiRow = await res.json();
      setPois(prev => prev.map(p => p.id === updated.id ? updated : p));
      onSaved?.();
    } else {
      toast('Error al ubicar el punto en el mapa.', 'error');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !selectedId) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      distanceLabel: form.distanceLabel.trim() || null,
      image: form.image || null,
      walkMinutes: form.walkMinutes === '' ? null : Number(form.walkMinutes),
      driveMinutes: form.driveMinutes === '' ? null : Number(form.driveMinutes),
      bikeMinutes: form.bikeMinutes === '' ? null : Number(form.bikeMinutes),
    };
    const res = await fetch(`/api/admin/points-of-interest/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const updated: PoiRow = await res.json();
      setPois(prev => prev.map(p => p.id === updated.id ? updated : p));
      toast('Cambios guardados.');
      onSaved?.();
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este punto de interés?', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/points-of-interest/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Punto de interés borrado.');
      setPois(prev => prev.filter(p => p.id !== id));
      if (selectedId === id) closeEdit();
      onSaved?.();
    } else {
      toast('Error al borrar.', 'error');
    }
  };

  const handleCalculateTimes = async () => {
    if (!projectId) return;
    setCalculatingTimes(true);
    const res = await fetch('/api/admin/calculate-travel-times', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId }),
    });
    const data = await res.json().catch(() => ({}));
    setCalculatingTimes(false);
    if (res.ok) {
      toast(data.message ?? `Tiempos actualizados para ${data.updated} punto${data.updated === 1 ? '' : 's'} de interés.`);
      load();
      onSaved?.();
    } else {
      toast(data.error ?? 'Error al calcular los tiempos.', 'error');
    }
  };

  if (loading) return <LoadingSpinner text="Cargando ubicación..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar los puntos de interés." onRetry={load} />;

  const overviewPois: OverviewPoi[] = visible.map(p => ({
    id: p.id, name: p.name, category: p.category, latitude: p.latitude, longitude: p.longitude,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500">
          {pois.length} punto{pois.length === 1 ? '' : 's'} · {placedCount} ubicado{placedCount === 1 ? '' : 's'} en el mapa
        </p>
        <div className="flex items-center gap-2">
          {missingTimes > 0 && (
            <button
              onClick={handleCalculateTimes}
              disabled={calculatingTimes || !projectId}
              className="h-9 px-3.5 flex items-center gap-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-900 hover:border-gray-300 disabled:opacity-50 transition-colors bg-white"
              title="Calcula los 3 tiempos de viaje para los puntos con coordenadas, usando Google Maps"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              {calculatingTimes ? 'Calculando...' : `Calcular tiempos (${missingTimes} sin datos)`}
            </button>
          )}
          <button
            onClick={() => setFitToken(t => t + 1)}
            className="h-9 px-3.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Ver todos en el mapa
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 h-[70vh] min-h-[540px]">
        <div className="relative flex-1 min-w-0 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
          <LocationOverviewMap
            center={projectCenter}
            pois={overviewPois}
            selectedId={selectedId}
            onSelectMarker={handleSelectMarker}
            onMapClick={handleMapClick}
            fitToken={fitToken}
          />
          <div className="absolute left-3 top-3 z-[500] flex flex-col gap-2 pointer-events-none max-w-[calc(100%-24px)]">
            <div
              className={`self-start pointer-events-none h-8 px-3 flex items-center rounded-lg text-[12px] font-medium shadow-md ${
                awaitingPlacement ? 'bg-gray-900 text-white' : 'bg-white/95 text-gray-600'
              }`}
            >
              {awaitingPlacement ? 'Hacé click en el mapa para ubicar este punto' : 'Seleccioná un punto y hacé click en el mapa para ubicarlo'}
            </div>
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              <button
                onClick={() => setFilter('todos')}
                className={`h-[29px] px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium shadow whitespace-nowrap transition-colors ${
                  filter === 'todos' ? 'bg-gray-900 text-white' : 'bg-white/95 text-gray-900 border border-gray-200'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />Todos
              </button>
              {CATEGORIES.map(c => {
                const n = pois.filter(p => p.category === c).length;
                const active = filter === c;
                return (
                  <button
                    key={c}
                    onClick={() => setFilter(active ? 'todos' : c)}
                    className={`h-[29px] px-2.5 flex items-center gap-1.5 rounded-lg text-[11px] font-medium shadow whitespace-nowrap transition-colors ${
                      active ? 'bg-gray-900 text-white' : 'bg-white/95 text-gray-900 border border-gray-200'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: POI_CATEGORY_COLORS[c] }} />
                    {CATEGORY_LABELS[c]}{n ? ` ${n}` : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-[380px] flex-none flex flex-col rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="flex-none p-3 border-b border-gray-100 flex flex-col gap-2">
            <div className="flex gap-1.5">
              <input
                type="text"
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddDraft(); }}
                placeholder="Nombre del punto…"
                className="flex-1 min-w-0 h-9 px-3 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              />
              <select
                value={draftCat}
                onChange={e => setDraftCat(e.target.value as PoiCategory)}
                className="w-32 flex-none h-9 px-2 border border-gray-300 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-500 transition-all"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              <button
                onClick={handleAddDraft}
                disabled={!draftName.trim() || creatingDraft}
                className={`w-9 h-9 flex-none flex items-center justify-center rounded-lg text-lg transition-colors ${
                  draftName.trim() ? 'bg-brand-500 text-white hover:bg-brand-600' : 'bg-gray-100 text-gray-300'
                } disabled:cursor-not-allowed`}
              >
                +
              </button>
            </div>
            <p className="text-[11px] leading-snug text-gray-400">
              Escribí un nombre y apretá Enter. Después hacé click en el mapa para ubicarlo.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {visible.length === 0 ? (
              <EmptyState title="No hay puntos en esta categoría" description="Cargá el primero desde el campo de arriba o hacé click en el mapa." />
            ) : (
              <div className="divide-y divide-gray-100">
                {visible.map((p, i) => {
                  const open = selectedId === p.id;
                  const color = POI_CATEGORY_COLORS[p.category];
                  return (
                    <div key={p.id} className={open ? 'bg-brand-50/50' : ''}>
                      <div onClick={() => openRow(p)} className="flex items-start gap-2.5 p-3 cursor-pointer hover:bg-gray-50 transition-colors">
                        <span
                          className="w-[22px] h-[22px] flex-none mt-0.5 rounded-full flex items-center justify-center text-[10px] font-semibold text-white"
                          style={{ background: color }}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1 flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <p className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">{p.name}</p>
                            <span
                              className="flex-none text-[9.5px] font-medium px-1.5 py-0.5 rounded"
                              style={{ color, background: `${color}1f` }}
                            >
                              {CATEGORY_LABELS[p.category]}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.latitude != null ? (
                              timePills(p).map((t, idx) => (
                                <span
                                  key={idx}
                                  className={`h-5 px-2 flex items-center rounded text-[10px] font-medium ${
                                    t.muted ? 'bg-gray-50 text-gray-400' : 'bg-gray-100 text-gray-600'
                                  }`}
                                >
                                  {t.label}
                                </span>
                              ))
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); handleLocate(p); }}
                                className="h-5 px-2 flex items-center rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                              >
                                Sin ubicar — marcar en el mapa
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {open && (
                        <form onSubmit={handleSubmit} className="px-3 pb-3 pl-[42px] flex flex-col gap-3">
                          <div className="grid grid-cols-1 gap-2.5">
                            <Input
                              label="Nombre"
                              value={form.name}
                              onChange={e => setForm({ ...form, name: e.target.value })}
                              required
                            />
                            <Select
                              label="Categoría"
                              value={form.category}
                              onChange={e => setForm({ ...form, category: e.target.value as PoiCategory })}
                            >
                              {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                            </Select>
                          </div>

                          <Input
                            label="Distancia (texto libre)"
                            value={form.distanceLabel}
                            onChange={e => setForm({ ...form, distanceLabel: e.target.value })}
                            placeholder="5 min caminando"
                          />

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                            <textarea
                              value={form.description}
                              onChange={e => setForm({ ...form, description: e.target.value })}
                              rows={2}
                              placeholder="Opcional — se muestra en la ficha del sitio público."
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none transition-all"
                            />
                          </div>

                          <ImageUploader
                            label="Foto (opcional)"
                            value={form.image}
                            onChange={url => setForm({ ...form, image: url })}
                            folder="poi"
                          />

                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-400">
                              {p.latitude != null ? `${p.latitude.toFixed(5)}, ${p.longitude!.toFixed(5)}` : 'Sin ubicar'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleLocate(p)}
                              className="text-xs font-medium text-brand-600 hover:text-brand-700"
                            >
                              {p.latitude != null ? 'Reubicar en el mapa' : 'Ubicar en el mapa'}
                            </button>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tiempos de viaje (min)</label>
                            <div className="grid grid-cols-3 gap-2">
                              <Input
                                type="number"
                                value={form.driveMinutes}
                                onChange={e => setForm({ ...form, driveMinutes: e.target.value })}
                                placeholder="Auto"
                              />
                              <Input
                                type="number"
                                value={form.walkMinutes}
                                onChange={e => setForm({ ...form, walkMinutes: e.target.value })}
                                placeholder="Caminando"
                              />
                              <Input
                                type="number"
                                value={form.bikeMinutes}
                                onChange={e => setForm({ ...form, bikeMinutes: e.target.value })}
                                placeholder="Bici"
                              />
                            </div>
                          </div>

                          <div className="pt-2 border-t border-gray-100 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <Button type="submit" size="sm" disabled={saving}>
                                {saving ? 'Guardando...' : 'Guardar cambios'}
                              </Button>
                              <Button type="button" variant="ghost" size="sm" onClick={closeEdit}>Cerrar</Button>
                            </div>
                            <Button type="button" variant="danger" size="sm" onClick={() => handleDelete(p.id)}>Borrar</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex-none border-t border-gray-100 p-2.5 flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">
              {pois.length - placedCount > 0
                ? `${pois.length - placedCount} punto(s) sin ubicar no se muestran en el mapa público`
                : 'Todos los puntos están ubicados en el mapa'}
            </span>
            <button
              onClick={() => setByCategory(v => !v)}
              className="flex-none h-7 px-2.5 flex items-center border border-gray-200 rounded-md text-[11px] font-medium text-gray-900 hover:border-gray-300 bg-white transition-colors"
            >
              {byCategory ? 'Orden: categoría' : 'Orden: carga'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
