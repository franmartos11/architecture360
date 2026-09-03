'use client';

import { useState, useEffect, useMemo } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { Card } from '@/components/ui/Card';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import type { TourData } from '@/types';
import type { BuildingRow as DbBuildingRow, AmenityRow as DbAmenityRow } from '@/types/database';

type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'amenities_tour'>;
type AmenityRow = Pick<DbAmenityRow,
  | 'id' | 'building_id' | 'name' | 'description' | 'images'
  | 'tour_node_id' | 'tour_3d_url' | 'sort_order' | 'visible'
>;

// 'all' = todas, 'complex' = solo las de todo el complejo (building_id nulo),
// o el id de una torre puntual — mismo criterio que ya usa el filtro de
// AmenitiesView.tsx (la página pública de amenities).
type Filter = 'all' | 'complex' | string;
type View = 'list' | 'grid';

const EMPTY_FORM = { buildingId: '', name: '', description: '', images: [] as string[], tourNodeId: '', tour3dUrl: '', visible: true };
const DESC_MAX = 2000; // mismo límite que sanitizeMultiline() aplica server-side

// Cuerpo de la pantalla de Amenidades, sin el header — lo usan tanto
// /admin/proyecto/amenities (con su propio breadcrumb/título) como el panel
// deslizable de /admin/sitio. onSaved es opcional: solo lo pasa /admin/sitio,
// para refrescar su preview en vivo tras cada cambio.
export default function AmenitiesEditor({ onSaved }: { onSaved?: () => void }) {
  const [amenities, setAmenities] = useState<AmenityRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [commonAreasTour, setCommonAreasTour] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [view, setView] = useState<View>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const fetchData = () => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setAmenities(data.amenities ?? []);
        setBuildings(data.buildings ?? []);
        setCommonAreasTour(data.project?.common_areas_tour ?? null);
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

  const availableNodes = useMemo(() => {
    if (!form.buildingId) return commonAreasTour?.nodes ?? [];
    return buildings.find(b => b.id === form.buildingId)?.amenities_tour?.nodes ?? [];
  }, [form.buildingId, buildings, commonAreasTour]);

  const closePanel = () => {
    setEditingId(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const startEdit = (a: AmenityRow) => {
    setCreating(false);
    setEditingId(a.id);
    setForm({
      buildingId: a.building_id ?? '',
      name: a.name,
      description: a.description ?? '',
      images: a.images ?? [],
      tourNodeId: a.tour_node_id ?? '',
      tour3dUrl: a.tour_3d_url ?? '',
      visible: a.visible,
    });
  };

  // Precarga el scope actual del filtro — si estás mirando "Torre A", lo
  // más probable es que la amenity nueva también sea de Torre A.
  const startCreate = () => {
    setEditingId(null);
    setCreating(true);
    setForm({ ...EMPTY_FORM, buildingId: filter === 'all' || filter === 'complex' ? '' : filter });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);

    const payload = {
      buildingId: form.buildingId || null,
      name: form.name.trim(),
      description: form.description.trim() || null,
      images: form.images.filter(Boolean),
      tourNodeId: form.tourNodeId || null,
      tour3dUrl: form.tour3dUrl.trim() || null,
      visible: form.visible,
    };

    const res = editingId
      ? await fetch(`/api/admin/amenities/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/amenities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, sortOrder: amenities.length }),
        });

    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Cambios guardados.' : 'Amenidad creada.');
      closePanel();
      load();
      onSaved?.();
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar esta amenidad? No se puede deshacer.', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/amenities/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Amenidad borrada.');
      if (editingId === id) closePanel();
      load();
      onSaved?.();
    } else {
      toast('Error al borrar.', 'error');
    }
  };

  const handleDuplicate = async (a: AmenityRow) => {
    const res = await fetch('/api/admin/amenities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingId: a.building_id, name: `${a.name} (copia)`, description: a.description,
        images: a.images, tourNodeId: a.tour_node_id, tour3dUrl: a.tour_3d_url, visible: a.visible,
        sortOrder: amenities.length,
      }),
    });
    if (res.ok) {
      const created: AmenityRow = await res.json();
      toast('Amenidad duplicada.');
      load();
      setCreating(false);
      setEditingId(created.id);
      setForm({
        buildingId: created.building_id ?? '', name: created.name, description: created.description ?? '',
        images: created.images ?? [], tourNodeId: created.tour_node_id ?? '', tour3dUrl: created.tour_3d_url ?? '',
        visible: created.visible,
      });
      onSaved?.();
    } else {
      toast('Error al duplicar.', 'error');
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= amenities.length) return;

    const a = amenities[index];
    const b = amenities[swapWith];
    const reordered = [...amenities];
    reordered[index] = b;
    reordered[swapWith] = a;
    setAmenities(reordered);

    const [resA, resB] = await Promise.all([
      fetch(`/api/admin/amenities/${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: b.sort_order }),
      }),
      fetch(`/api/admin/amenities/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sortOrder: a.sort_order }),
      }),
    ]);
    if (!resA.ok || !resB.ok) {
      toast('Error al reordenar.', 'error');
      load();
    } else {
      onSaved?.();
    }
  };

  // Instant-save, igual que reordenar: no forma parte del form con
  // "Guardar cambios" — se ve y persiste al toque, tanto desde el ícono de
  // ojo de la lista como desde el switch del panel.
  const setVisible = async (id: string, visible: boolean) => {
    setAmenities(prev => prev.map(a => (a.id === id ? { ...a, visible } : a)));
    if (editingId === id) setForm(f => ({ ...f, visible }));
    const res = await fetch(`/api/admin/amenities/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ visible }),
    });
    if (res.ok) onSaved?.();
    else { toast('Error al cambiar la visibilidad.', 'error'); load(); }
  };
  const toggleVisible = () => {
    if (editingId) setVisible(editingId, !form.visible);
    else setForm(f => ({ ...f, visible: !f.visible }));
  };

  const filtered = useMemo(() => {
    if (filter === 'all') return amenities;
    if (filter === 'complex') return amenities.filter(a => !a.building_id);
    return amenities.filter(a => a.building_id === filter);
  }, [amenities, filter]);

  const chips = useMemo(() => ([
    { key: 'all' as Filter, label: 'Todas', count: amenities.length },
    { key: 'complex' as Filter, label: 'Todo el complejo', count: amenities.filter(a => !a.building_id).length },
    ...buildings.map(b => ({ key: b.id as Filter, label: b.name, count: amenities.filter(a => a.building_id === b.id).length })),
  ]), [amenities, buildings]);

  const hiddenCount = amenities.filter(a => !a.visible).length;
  const hasSel = creating || editingId !== null;
  const cur = editingId ? amenities.find(a => a.id === editingId) ?? null : null;

  if (loading) return <LoadingSpinner text="Cargando amenidades..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar las amenidades." onRetry={load} />;

  return (
    <div className="flex flex-col xl:flex-row gap-4 xl:h-[70vh] xl:min-h-[560px]">
      {/* ── Lista ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-3.5 xl:h-full xl:overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <h3 className="text-lg font-semibold text-gray-900">Amenidades</h3>
            <span className="text-xs text-gray-400">
              {amenities.length} amenidad{amenities.length === 1 ? '' : 'es'}{hiddenCount ? ` · ${hiddenCount} oculta${hiddenCount === 1 ? '' : 's'}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setView(v => (v === 'list' ? 'grid' : 'list'))}
              className="h-8 px-3 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:border-gray-300 transition-colors"
            >
              {view === 'grid' ? 'Ver en lista' : 'Ver en mosaico'}
            </button>
            <button
              type="button" onClick={startCreate}
              className="h-8 px-3 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors"
            >
              + Nueva amenidad
            </button>
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-1.5 flex-wrap">
          {chips.map(c => (
            <button
              key={c.key} type="button" onClick={() => setFilter(f => (f === c.key ? 'all' : c.key))}
              className={`h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap ${
                filter === c.key ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {c.label}{c.count ? ` · ${c.count}` : ''}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="py-14 flex flex-col items-center gap-2 text-center px-6">
              <p className="text-sm font-medium text-gray-900">
                {amenities.length === 0 ? 'Todavía no hay amenidades cargadas' : 'Ninguna amenidad en este filtro'}
              </p>
              <p className="max-w-sm text-xs text-gray-500 leading-relaxed">
                Pileta, gimnasio, SUM: cada una con su galería de renders y, si querés, un punto de entrada al recorrido 360°.
              </p>
              <button
                type="button" onClick={startCreate}
                className="mt-1 h-8 px-3.5 rounded-lg text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors"
              >
                + Nueva amenidad
              </button>
            </div>
          ) : view === 'list' ? (
            <Card className="overflow-hidden">
              <div className="divide-y divide-gray-100">
                {filtered.map((a) => {
                  const idx = amenities.findIndex(x => x.id === a.id);
                  const building = buildings.find(b => b.id === a.building_id);
                  const node = a.tour_node_id
                    ? (a.building_id ? building?.amenities_tour?.nodes : commonAreasTour?.nodes)?.find(n => n.id === a.tour_node_id)
                    : null;
                  const photoCount = a.images?.length ?? 0;
                  const isSel = editingId === a.id;
                  return (
                    <div
                      key={a.id} onClick={() => startEdit(a)}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${isSel ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                    >
                      <div className="flex flex-col shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button" onClick={() => handleReorder(idx, 'up')} disabled={idx === 0} aria-label="Subir"
                          className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400 text-[11px]"
                        >↑</button>
                        <button
                          type="button" onClick={() => handleReorder(idx, 'down')} disabled={idx === amenities.length - 1} aria-label="Bajar"
                          className="w-5 h-4 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400 text-[11px]"
                        >↓</button>
                      </div>
                      <div className={`w-14 h-11 rounded-lg overflow-hidden shrink-0 bg-gray-100 ${a.visible ? '' : 'opacity-45'}`}>
                        {a.images?.[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.images[0]} alt="" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 truncate">{a.name || 'Amenidad sin nombre'}</p>
                          <Pill>{building ? building.name : 'Todo el complejo'}</Pill>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Pill tone={photoCount ? 'default' : 'warn'}>{photoCount ? `${photoCount} foto${photoCount === 1 ? '' : 's'}` : 'sin fotos'}</Pill>
                          {node && <Pill tone="accent">360° · {node.name}</Pill>}
                          {a.tour_3d_url && <Pill>3D</Pill>}
                          {!a.visible && <Pill tone="warn">oculta</Pill>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button" title="Visible en el sitio" onClick={() => setVisible(a.id, !a.visible)}
                          className={`w-8 h-8 flex items-center justify-center border rounded-lg text-sm transition-colors ${
                            a.visible ? 'border-gray-200 text-gray-500 hover:border-gray-300' : 'border-amber-300 text-amber-700 bg-amber-50'
                          }`}
                        >{a.visible ? '◉' : '◎'}</button>
                        <button
                          type="button" title="Duplicar" onClick={() => handleDuplicate(a)}
                          className="w-8 h-8 flex items-center justify-center border border-gray-200 rounded-lg text-gray-400 hover:border-gray-300 hover:text-gray-700 transition-colors"
                        >⧉</button>
                        <button
                          type="button" title="Borrar" onClick={() => handleDelete(a.id)}
                          className="w-8 h-8 flex items-center justify-center border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                        >✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {filtered.map(a => {
                const building = buildings.find(b => b.id === a.building_id);
                const isSel = editingId === a.id;
                return (
                  <button
                    key={a.id} type="button" onClick={() => startEdit(a)}
                    className={`text-left rounded-xl overflow-hidden bg-white transition-colors ${
                      isSel ? 'border-2 border-brand-500 shadow-[0_0_0_3px_rgba(92,122,88,.12)]' : 'border border-gray-200 hover:border-gray-300'
                    } ${a.visible ? '' : 'opacity-55'}`}
                  >
                    <div className="relative h-28 bg-gray-100">
                      {a.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.images[0]} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-gray-400">sin foto</span>
                      )}
                    </div>
                    <div className="px-3 py-2.5 flex flex-col gap-1.5">
                      <p className="text-sm font-semibold text-gray-900 truncate">{a.name || 'Amenidad sin nombre'}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Pill>{building ? building.name : 'Todo el complejo'}</Pill>
                        {!a.visible && <Pill tone="warn">oculta</Pill>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Panel de edición ──────────────────────────────────── */}
      <div className="w-full xl:w-[400px] shrink-0 xl:h-full">
        <Card className="flex flex-col xl:h-full">
          {hasSel ? (
            <>
              <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-gray-900">{creating ? 'Nueva amenidad' : 'Editar amenidad'}</p>
                <button
                  type="button" onClick={closePanel} aria-label="Cerrar"
                  className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                >✕</button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 xl:min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Nombre</label>
                  <input
                    value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Piscina infinita" required autoFocus
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <p className="text-[11.5px] font-medium text-gray-900">Pertenece a</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <ScopeChip active={form.buildingId === ''} onClick={() => setForm({ ...form, buildingId: '', tourNodeId: '' })}>Todo el complejo</ScopeChip>
                    {buildings.map(b => (
                      <ScopeChip key={b.id} active={form.buildingId === b.id} onClick={() => setForm({ ...form, buildingId: b.id, tourNodeId: '' })}>{b.name}</ScopeChip>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <label className="text-[11.5px] font-medium text-gray-900">Descripción</label>
                    <span className="text-[10px] text-gray-400">{form.description.length}/{DESC_MAX}</span>
                  </div>
                  <textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value.slice(0, DESC_MAX) })}
                    rows={3}
                    placeholder="Un párrafo corto — se muestra debajo del nombre en el sitio público."
                    className="px-2.5 py-2 rounded-lg border border-gray-300 text-xs leading-relaxed outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[11.5px] font-medium text-gray-900">Galería de renders</p>
                    <span className="text-[10px] text-gray-400">{form.images.length ? `${form.images.length} imagen${form.images.length === 1 ? '' : 'es'}` : 'todavía sin imágenes'}</span>
                  </div>
                  <MultiImageUploader values={form.images} onChange={images => setForm({ ...form, images })} folder="amenities" />
                  {form.images.length > 0 && <p className="text-[10.5px] text-gray-400">la primera es la portada</p>}
                </div>

                <div className="h-px bg-gray-100" />

                <div className="flex flex-col gap-2">
                  <p className="text-[11.5px] font-medium text-gray-900">
                    Recorridos vinculados <span className="font-normal text-gray-400">— opcional</span>
                  </p>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-600">Nodo del recorrido 360°</label>
                    <select
                      value={form.tourNodeId} onChange={e => setForm({ ...form, tourNodeId: e.target.value })}
                      className="h-9 px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">Sin recorrido 360°</option>
                      {availableNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                  </div>
                  {availableNodes.length === 0 && (
                    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          {form.buildingId ? 'Esta torre todavía no tiene su recorrido 360° cargado.' : 'El proyecto todavía no tiene un recorrido de espacios comunes cargado.'}
                        </p>
                        <Link
                          href={form.buildingId ? `/admin/edificios/${form.buildingId}/recorrido` : '/admin/proyecto/recorrido'}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 hover:text-amber-900 mt-1"
                        >
                          Ir a cargar recorrido →
                        </Link>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-gray-600">Recorrido 3D (Matterport)</label>
                    <input
                      type="url" value={form.tour3dUrl} onChange={e => setForm({ ...form, tour3dUrl: e.target.value })}
                      placeholder="https://my.matterport.com/show/?m=…"
                      className="h-9 px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <button
                  type="button" onClick={toggleVisible}
                  className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 bg-gray-50/60 hover:bg-gray-50 transition-colors text-left"
                >
                  <span className={`w-8 h-[18px] shrink-0 rounded-full p-0.5 flex transition-colors ${form.visible ? 'bg-brand-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                    <span className="w-[14px] h-[14px] rounded-full bg-white shadow" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-gray-900">{form.visible ? 'Visible en el sitio público' : 'Oculta en el sitio público'}</span>
                    <span className="block text-[10.5px] text-gray-500 leading-tight mt-0.5">
                      {form.visible ? 'Aparece en la sección Amenidades del sitio.' : 'Se guarda pero no se publica todavía.'}
                    </span>
                  </span>
                </button>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="submit" disabled={saving || !form.name.trim()}
                    className="h-9 px-3.5 rounded-lg text-xs font-medium text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors bg-gray-900 hover:bg-gray-800 disabled:hover:bg-gray-200"
                  >
                    {saving ? 'Guardando...' : creating ? '+ Crear amenidad' : 'Guardar cambios'}
                  </button>
                  {!creating && cur && (
                    <button
                      type="button" onClick={() => handleDelete(cur.id)}
                      className="h-9 px-3 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Borrar
                    </button>
                  )}
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-2.5 px-5 py-10 text-center">
              <div className="w-11 h-11 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 text-lg">▣</div>
              <p className="text-sm font-medium text-gray-900">Elegí una amenidad</p>
              <p className="text-xs text-gray-500 leading-relaxed max-w-[220px]">Se edita acá al lado, sin perder de vista el orden en que se ven en el sitio público.</p>
              <button
                type="button" onClick={startCreate}
                className="mt-1 h-8 px-3 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:border-gray-300 transition-colors"
              >
                + Nueva amenidad
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Pill({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warn' | 'accent' }) {
  const cls = tone === 'warn'
    ? 'bg-amber-50 text-amber-800'
    : tone === 'accent'
    ? 'bg-brand-50 text-brand-700'
    : 'bg-gray-100 text-gray-600';
  return <span className={`shrink-0 h-5 px-2 flex items-center rounded-full text-[10px] font-medium ${cls}`}>{children}</span>;
}

function ScopeChip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors ${
        active ? 'bg-brand-500 text-white border-brand-500' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  );
}
