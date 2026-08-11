'use client';

import { useState, useEffect, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import type { UnitStatus, UnitType } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';

interface UnitRow {
  id: string;
  code: string;
  model_name: string | null;
  type: UnitType;
  total_area: number | null;
  inner_area: number | null;
  balcony_area: number;
  external_area: number;
  bedrooms: number;
  bathrooms: number;
  has_service_room: boolean;
  price: number | null;
  status: UnitStatus;
  orientation: string | null;
  interior_image_url: string | null;
  gallery_images: string[] | null;
  floor_plan_3d_url: string | null;
  plan_3d_url: string | null;
  technical_plan_url: string | null;
}

const UNIT_TYPES: UnitType[] = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'];

const EMPTY_FORM = {
  code: '', modelName: '', type: '2 dormitorios' as UnitType,
  totalArea: '', innerArea: '', balconyArea: '0', externalArea: '0',
  bedrooms: '2', bathrooms: '2', hasServiceRoom: false,
  price: '', status: 'available' as UnitStatus, orientation: '',
  interiorImageUrl: '', galleryImages: [] as string[],
  floorPlan3dUrl: '', plan3dUrl: '', technicalPlanUrl: '',
};

export default function AdminFloorUnitsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);

  const [buildingName, setBuildingName] = useState('');
  const [floorLabel, setFloorLabel] = useState('');
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch(`/api/admin/buildings/${buildingId}`).then(res => res.json()),
      fetch(`/api/admin/units?floorId=${floorId}`).then(res => res.json()),
    ]).then(([buildingData, unitsData]) => {
      setBuildingName(buildingData.building?.name ?? '');
      const floor = (buildingData.floors ?? []).find((f: { id: string }) => f.id === floorId);
      setFloorLabel(floor?.label ?? '');
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setLoading(false);
    }).catch(() => {
      setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(load, [buildingId, floorId]);

  const startEdit = (u: UnitRow) => {
    setEditingId(u.id);
    setForm({
      code: u.code,
      modelName: u.model_name ?? '',
      type: u.type,
      totalArea: String(u.total_area ?? ''),
      innerArea: String(u.inner_area ?? ''),
      balconyArea: String(u.balcony_area ?? 0),
      externalArea: String(u.external_area ?? 0),
      bedrooms: String(u.bedrooms ?? 0),
      bathrooms: String(u.bathrooms ?? 1),
      hasServiceRoom: u.has_service_room,
      price: u.price != null ? String(u.price) : '',
      status: u.status,
      orientation: u.orientation ?? '',
      interiorImageUrl: u.interior_image_url ?? '',
      galleryImages: u.gallery_images ?? [],
      floorPlan3dUrl: u.floor_plan_3d_url ?? '',
      plan3dUrl: u.plan_3d_url ?? '',
      technicalPlanUrl: u.technical_plan_url ?? '',
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  const buildPayload = () => ({
    code: form.code,
    modelName: form.modelName || null,
    type: form.type,
    totalArea: form.totalArea === '' ? null : Number(form.totalArea),
    innerArea: form.innerArea === '' ? null : Number(form.innerArea),
    balconyArea: Number(form.balconyArea || 0),
    externalArea: Number(form.externalArea || 0),
    bedrooms: Number(form.bedrooms || 0),
    bathrooms: Number(form.bathrooms || 1),
    hasServiceRoom: form.hasServiceRoom,
    price: form.price === '' ? null : Number(form.price),
    status: form.status,
    orientation: form.orientation || null,
    interiorImageUrl: form.interiorImageUrl || null,
    galleryImages: form.galleryImages.filter(Boolean),
    floorPlan3dUrl: form.floorPlan3dUrl || null,
    plan3dUrl: form.plan3dUrl || null,
    technicalPlanUrl: form.technicalPlanUrl || null,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.code || !form.type) {
      setError('Faltan código y/o tipología.');
      return;
    }
    setSaving(true);

    const payload = buildPayload();
    const res = editingId
      ? await fetch(`/api/admin/units/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      : await fetch('/api/admin/units', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, floorId }),
        });

    setSaving(false);
    if (res.ok) {
      toast(editingId ? 'Cambios guardados.' : 'Unidad creada.');
      cancelEdit();
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al guardar la unidad.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Borrar esta unidad?')) return;
    const res = await fetch(`/api/admin/units/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Unidad borrada.');
      if (editingId === id) cancelEdit();
      load();
    } else {
      toast('Error al borrar la unidad.', 'error');
    }
  };

  if (loading) return <LoadingSpinner text="Cargando unidades..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar las unidades." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={`/admin/edificios/${buildingId}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName}</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Unidades — {floorLabel}</h2>
        </div>
        <Link
          href={`/admin/edificios/${buildingId}/pisos/${floorId}/plano`}
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          Delimitar en el plano →
        </Link>
      </div>

      <Card>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Código</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Modelo / Tipo</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">m²</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Estado</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Precio</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {units.map(u => (
              <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${editingId === u.id ? 'bg-brand-50/50' : ''}`}>
                <td className="px-6 py-3 font-medium text-gray-900">{u.code}</td>
                <td className="px-6 py-3 text-sm text-gray-600">{u.model_name} <span className="text-gray-400">· {u.type}</span></td>
                <td className="px-6 py-3 text-sm text-gray-600">{u.total_area ?? '—'}</td>
                <td className="px-6 py-3 text-sm">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium
                    ${u.status === 'available' ? 'bg-green-50 text-green-700' : ''}
                    ${u.status === 'reserved' ? 'bg-yellow-50 text-yellow-700' : ''}
                    ${u.status === 'sold' ? 'bg-red-50 text-red-700' : ''}`}>
                    {u.status}
                  </span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-600">{u.price ? `$${u.price.toLocaleString()}` : '—'}</td>
                <td className="px-6 py-3 text-right space-x-3 whitespace-nowrap">
                  <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>
                  <button onClick={() => startEdit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                  <button onClick={() => handleDelete(u.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                </td>
              </tr>
            ))}
            {units.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Todavía no hay unidades en este piso.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">{editingId ? `Editando ${form.code}` : 'Nueva unidad'}</h3>
        </CardHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Código" id="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="A01-01" required />
            <Input label="Modelo" id="modelName" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} placeholder="SUITE GARDEN" />
            <Select label="Tipología" id="type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as UnitType })}>
              {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Select label="Estado" id="status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as UnitStatus })}>
              <option value="available">Disponible</option>
              <option value="reserved">Reservado</option>
              <option value="sold">Vendido</option>
            </Select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Área total (m²)" id="totalArea" type="number" step="0.01" value={form.totalArea} onChange={e => setForm({ ...form, totalArea: e.target.value })} />
            <Input label="Área interna (m²)" id="innerArea" type="number" step="0.01" value={form.innerArea} onChange={e => setForm({ ...form, innerArea: e.target.value })} />
            <Input label="Balcón (m²)" id="balconyArea" type="number" step="0.01" value={form.balconyArea} onChange={e => setForm({ ...form, balconyArea: e.target.value })} />
            <Input label="Área externa (m²)" id="externalArea" type="number" step="0.01" value={form.externalArea} onChange={e => setForm({ ...form, externalArea: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Dormitorios" id="bedrooms" type="number" min={0} value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} />
            <Input label="Baños" id="bathrooms" type="number" min={0} step="0.5" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} />
            <Input label="Precio (USD)" id="price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Consultar precio" />
            <Input label="Orientación" id="orientation" value={form.orientation} onChange={e => setForm({ ...form, orientation: e.target.value })} placeholder="NE" />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.hasServiceRoom} onChange={e => setForm({ ...form, hasServiceRoom: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
            Tiene cuarto de servicio
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUploader label="Foto interior" value={form.interiorImageUrl} onChange={url => setForm({ ...form, interiorImageUrl: url })} folder="units" />
            <ImageUploader label="Render / planta 3D" value={form.floorPlan3dUrl} onChange={url => setForm({ ...form, floorPlan3dUrl: url })} folder="floorplans" />
            <ImageUploader label="Plano 3D técnico" value={form.plan3dUrl} onChange={url => setForm({ ...form, plan3dUrl: url })} folder="floorplans" />
            <ImageUploader label="Plano 2D técnico" value={form.technicalPlanUrl} onChange={url => setForm({ ...form, technicalPlanUrl: url })} folder="floorplans" />
          </div>

          <MultiImageUploader label="Galería" values={form.galleryImages} onChange={urls => setForm({ ...form, galleryImages: urls })} folder="units" />

          <p className="text-xs text-gray-500">
            El polígono del depto en el plano, los ambientes y el tour 360° se cargan desde los botones "Ambientes" y "Delimitar en el plano".
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : '+ Crear unidad'}
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
