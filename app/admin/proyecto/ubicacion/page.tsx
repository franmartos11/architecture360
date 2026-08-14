'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import ImageUploader from '@/components/admin/ImageUploader';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import type { PoiCategory } from '@/types';
import type { PointOfInterestRow } from '@/types/database';

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

const EMPTY_FORM = {
  name: '',
  category: 'otro' as PoiCategory,
  description: '',
  distanceLabel: '',
  image: '',
  latitude: '',
  longitude: '',
  walkMinutes: '',
  driveMinutes: '',
  bikeMinutes: '',
};

export default function AdminUbicacionPage() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pois, setPois] = useState<PoiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [calculatingTimes, setCalculatingTimes] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setProjectId(data.project?.id ?? null);
        setPois(data.pointsOfInterest ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

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
    } else {
      toast(data.error ?? 'Error al calcular los tiempos.', 'error');
    }
  };

  const startEdit = (p: PoiRow) => {
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      description: p.description ?? '',
      distanceLabel: p.distance_label ?? '',
      image: p.image ?? '',
      latitude: p.latitude != null ? String(p.latitude) : '',
      longitude: p.longitude != null ? String(p.longitude) : '',
      walkMinutes: p.walk_minutes != null ? String(p.walk_minutes) : '',
      driveMinutes: p.drive_minutes != null ? String(p.drive_minutes) : '',
      bikeMinutes: p.bike_minutes != null ? String(p.bike_minutes) : '',
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
      name: form.name.trim(),
      category: form.category,
      description: form.description.trim() || null,
      distanceLabel: form.distanceLabel.trim() || null,
      image: form.image || null,
      latitude: form.latitude === '' ? null : Number(form.latitude),
      longitude: form.longitude === '' ? null : Number(form.longitude),
      walkMinutes: form.walkMinutes === '' ? null : Number(form.walkMinutes),
      driveMinutes: form.driveMinutes === '' ? null : Number(form.driveMinutes),
      bikeMinutes: form.bikeMinutes === '' ? null : Number(form.bikeMinutes),
    };

    const res = editingId
      ? await fetch(`/api/admin/points-of-interest/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/points-of-interest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, sortOrder: pois.length }),
        });

    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Cambios guardados.' : 'Punto de interés creado.');
      cancelEdit();
      load();
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
      if (editingId === id) cancelEdit();
      load();
    } else {
      toast('Error al borrar.', 'error');
    }
  };

  if (loading) return <LoadingSpinner text="Cargando ubicación..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar los puntos de interés." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Ubicación y Puntos de Interés</h2>
          <p className="text-sm text-gray-500 mt-1">
            Colegios, salud, comercios, transporte y entretenimiento cercanos al proyecto. Las coordenadas del centro del mapa se configuran en "Proyecto → Datos generales".
          </p>
        </div>
        <button
          onClick={handleCalculateTimes}
          disabled={calculatingTimes || !projectId}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors whitespace-nowrap"
          title="Calcula los 3 tiempos de viaje para todos los puntos que tengan coordenadas, usando Google Maps"
        >
          {calculatingTimes ? 'Calculando...' : '⏱ Calcular tiempos automáticamente'}
        </button>
      </div>

      {pois.length === 0 ? (
        <EmptyState title="Todavía no hay puntos de interés cargados." description="Creá el primero con el formulario de abajo." />
      ) : (
        <Card>
          <div className="divide-y divide-gray-100">
            {pois.map(p => (
              <div key={p.id} className={`p-4 flex items-center gap-4 ${editingId === p.id ? 'bg-brand-50/50' : ''}`}>
                <div className="w-14 h-14 rounded-lg bg-gray-100 overflow-hidden shrink-0">
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <span className="shrink-0 text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {CATEGORY_LABELS[p.category]}
                    </span>
                  </div>
                  {p.distance_label && <p className="text-xs text-gray-400 mt-0.5">{p.distance_label}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEdit(p)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                  <button onClick={() => handleDelete(p.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">{editingId ? `Editando "${form.name}"` : 'Nuevo punto de interés'}</h3>
        </CardHeader>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Nombre"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Colegio San Martín"
              required
            />
            <Select
              label="Categoría"
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value as PoiCategory })}
            >
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Distancia (texto libre)"
              value={form.distanceLabel}
              onChange={e => setForm({ ...form, distanceLabel: e.target.value })}
              placeholder="5 min caminando"
            />
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

          <ImageUploader
            label="Foto (opcional)"
            value={form.image}
            onChange={url => setForm({ ...form, image: url })}
            folder="poi"
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Coordenadas (opcional)</label>
              <a
                href="https://www.google.com/maps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-brand-600 hover:text-brand-700"
              >
                Buscar en Google Maps →
              </a>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                type="number"
                step="any"
                value={form.latitude}
                onChange={e => setForm({ ...form, latitude: e.target.value })}
                placeholder="Latitud"
              />
              <Input
                type="number"
                step="any"
                value={form.longitude}
                onChange={e => setForm({ ...form, longitude: e.target.value })}
                placeholder="Longitud"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tiempos de viaje (minutos, opcional — o usá "Calcular tiempos automáticamente" arriba una vez que tenga coordenadas)
            </label>
            <div className="grid grid-cols-3 gap-4">
              <Input
                type="number"
                value={form.driveMinutes}
                onChange={e => setForm({ ...form, driveMinutes: e.target.value })}
                placeholder="En auto"
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
                placeholder="En bici"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : '+ Crear punto de interés'}
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
