'use client';

import { useState, useEffect, useMemo } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import type { TourData } from '@/types';
import type { BuildingRow as DbBuildingRow, AmenityRow as DbAmenityRow } from '@/types/database';

type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'amenities_tour'>;
type AmenityRow = Pick<DbAmenityRow, 'id' | 'building_id' | 'name' | 'description' | 'images' | 'tour_node_id' | 'tour_3d_url' | 'sort_order'>;

const EMPTY_FORM = { buildingId: '', name: '', description: '', images: [] as string[], tourNodeId: '', tour3dUrl: '' };

// Cuerpo de la pantalla de Amenities, sin el header — lo usan tanto
// /admin/proyecto/amenities (con su propio breadcrumb/título) como el
// panel deslizable de /admin/sitio. onSaved es opcional: solo lo pasa
// /admin/sitio, para refrescar su preview en vivo tras cada cambio.
export default function AmenitiesEditor({ onSaved }: { onSaved?: () => void }) {
  const [amenities, setAmenities] = useState<AmenityRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [commonAreasTour, setCommonAreasTour] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();

  // Sin resets sincrónicos: se usa directo como callback del efecto de
  // montaje (los valores iniciales de loading/loadError ya son los
  // correctos para esa primera carga).
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

  const startEdit = (a: AmenityRow) => {
    setEditingId(a.id);
    setForm({
      buildingId: a.building_id ?? '',
      name: a.name,
      description: a.description ?? '',
      images: a.images ?? [],
      tourNodeId: a.tour_node_id ?? '',
      tour3dUrl: a.tour_3d_url ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
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
      toast(editingId ? 'Cambios guardados.' : 'Amenity creada.');
      cancelEdit();
      load();
      onSaved?.();
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar esta amenity?', confirmLabel: 'Borrar amenity', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/amenities/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Amenity borrada.');
      if (editingId === id) cancelEdit();
      load();
      onSaved?.();
    } else {
      toast('Error al borrar.', 'error');
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

  if (loading) return <LoadingSpinner text="Cargando amenities..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar las amenities." onRetry={load} />;

  return (
    <div className="space-y-6">
      {amenities.length === 0 ? (
        <EmptyState title="Todavía no hay amenities cargadas." description="Creá la primera con el formulario de abajo." />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {amenities.map((a, i) => {
              const building = buildings.find(b => b.id === a.building_id);
              return (
                <div key={a.id} className={`p-4 flex items-center gap-4 ${editingId === a.id ? 'bg-brand-50/50' : ''}`}>
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => handleReorder(i, 'up')}
                      disabled={i === 0}
                      aria-label="Subir"
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleReorder(i, 'down')}
                      disabled={i === amenities.length - 1}
                      aria-label="Bajar"
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                  </div>
                  <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                    {a.images?.[0] && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={a.images[0]} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 truncate">{a.name}</p>
                      <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                        {building ? building.name : 'Todo el complejo'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {a.images?.length ?? 0} {a.images?.length === 1 ? 'foto' : 'fotos'}
                      {a.tour_node_id && ' · con recorrido 360°'}
                      {a.tour_3d_url && ' · con recorrido 3D'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <button onClick={() => startEdit(a)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                    <button onClick={() => handleDelete(a.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">{editingId ? `Editando "${form.name}"` : 'Nueva amenity'}</h3>
        </CardHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Piscina infinita"
              required
            />
            <Select
              label="Pertenece a"
              value={form.buildingId}
              onChange={e => setForm({ ...form, buildingId: e.target.value, tourNodeId: '' })}
            >
              <option value="">Todo el complejo</option>
              {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-all"
            />
          </div>

          <MultiImageUploader
            label="Galería de renders (carrusel)"
            values={form.images}
            onChange={images => setForm({ ...form, images })}
            folder="amenities"
          />

          <Select
            label="Nodo del recorrido 360° (opcional)"
            value={form.tourNodeId}
            onChange={e => setForm({ ...form, tourNodeId: e.target.value })}
          >
            <option value="">Sin recorrido 360°</option>
            {availableNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
          </Select>
          {availableNodes.length === 0 && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 -mt-3">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-amber-800">
                  {form.buildingId
                    ? 'Esta torre todavía no tiene su recorrido 360° cargado.'
                    : 'El proyecto todavía no tiene un recorrido de espacios comunes cargado.'}
                </p>
                <Link
                  href={form.buildingId
                    ? `/admin/edificios/${form.buildingId}/recorrido`
                    : '/admin/proyecto/recorrido'}
                  className="inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-900 mt-1"
                >
                  Ir a cargar recorrido →
                </Link>
              </div>
            </div>
          )}

          <Input
            label="Recorrido 3D (opcional)"
            type="url"
            value={form.tour3dUrl}
            onChange={e => setForm({ ...form, tour3dUrl: e.target.value })}
            placeholder="https://my.matterport.com/show/?m=..."
          />

          <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : '+ Crear amenity'}
            </Button>
            {editingId && (
              <Button type="button" variant="ghost" onClick={cancelEdit} className="bg-transparent hover:bg-gray-100">
                Cancelar
              </Button>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}
