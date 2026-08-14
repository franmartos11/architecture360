'use client';

import { useState, useEffect, useRef } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import type { UnitType, UnitStatus } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { parseCsv, downloadCsv } from '@/lib/csv';

type UnitRow = Pick<DbUnitRow,
  | 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'inner_area' | 'balcony_area'
  | 'external_area' | 'bedrooms' | 'bathrooms' | 'has_service_room' | 'price' | 'status'
  | 'orientation' | 'interior_image_url' | 'gallery_images' | 'floor_plan_3d_url'
  | 'plan_3d_url' | 'technical_plan_url' | 'created_at'
>;

type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

const UNIT_TYPES: UnitType[] = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'];

const CSV_COLUMNS = [
  'code', 'modelName', 'type', 'totalArea', 'innerArea', 'balconyArea', 'externalArea',
  'bedrooms', 'bathrooms', 'hasServiceRoom', 'price', 'status', 'orientation',
  'interiorImageUrl', 'floorPlan3dUrl', 'plan3dUrl', 'technicalPlanUrl',
] as const;

const CSV_TEMPLATE_ROW = [
  'A01-01', 'SUITE GARDEN', '2 dormitorios', '65.5', '55', '10.5', '0',
  '2', '2', 'no', '150000', 'available', 'NE', '', '', '', '',
];

const EMPTY_FORM = {
  code: '', modelName: '', type: '2 dormitorios' as UnitType,
  totalArea: '', innerArea: '', balconyArea: '0', externalArea: '0',
  bedrooms: '2', bathrooms: '2', hasServiceRoom: false,
  price: '', status: 'available' as UnitStatus, orientation: '',
  interiorImageUrl: '', galleryImages: [] as string[],
  floorPlan3dUrl: '', plan3dUrl: '', technicalPlanUrl: '',
};

type SourceUnitLike = {
  model_name: string | null; type: UnitType; total_area: number | null; inner_area: number | null;
  balcony_area: number | null; external_area: number | null; bedrooms: number | null; bathrooms: number | null;
  has_service_room: boolean; price: number | null; status: UnitStatus; orientation: string | null;
  interior_image_url: string | null; gallery_images: string[] | null; floor_plan_3d_url: string | null;
  plan_3d_url: string | null; technical_plan_url: string | null;
};

// Todos los campos del form salvo el código (que siempre tiene que ser
// único) — se usa para "Editar", "Duplicar", "Copiar de otro piso" y para
// heredar los valores de la última unidad cargada en un depto nuevo.
function formFieldsFromUnit(u: SourceUnitLike) {
  return {
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
  };
}

// Editor de unidades de un piso (tabla + alta/edición) — se usa tanto en su
// pantalla standalone (pisos/[floorId]/page.tsx) como embebido dentro del
// wizard de carga guiada, para no repetir el formulario de 18 campos en
// dos lugares distintos.
export default function FloorUnitsEditor({ buildingId, floorId, onUnitsChange }: { buildingId?: string; floorId: string; onUnitsChange?: (units: UnitRow[]) => void }) {
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [otherUnits, setOtherUnits] = useState<OtherUnitRow[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const inheritedDefaultsApplied = useRef(false);

  // Unidades de CUALQUIER otro piso/edificio del proyecto — para poder
  // traer el mismo modelo a este piso sin retipear los 18 campos, cuando
  // el depto ya existe en otra torre o en un piso con layout distinto
  // (para pisos con el layout idéntico conviene usar "Duplicar piso" en
  // vez de esto, unidad por unidad).
  useEffect(() => {
    fetch('/api/admin/units')
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setOtherUnits(Array.isArray(data) ? data.filter(u => !units.some(un => un.id === u.id)) : []))
      .catch(() => {});
  }, [floorId, units]);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/units?floorId=${floorId}`)
      .then(res => res.json())
      .then((unitsData) => {
        const list: UnitRow[] = Array.isArray(unitsData) ? unitsData : [];
        setUnits(list);
        onUnitsChange?.(list);
        // La primera vez que se abre este piso, si ya tiene unidades
        // cargadas, el form de "Nueva unidad" arranca con los valores de
        // la última cargada (todo menos el código) — la mayoría de los
        // campos se repiten depto tras depto en el mismo piso.
        if (!inheritedDefaultsApplied.current && list.length > 0) {
          inheritedDefaultsApplied.current = true;
          const last = [...list].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
          setForm({ code: '', ...formFieldsFromUnit(last) });
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [floorId]);

  const startEdit = (u: UnitRow) => {
    setEditingId(u.id);
    setForm({ code: u.code, ...formFieldsFromUnit(u) });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
  };

  // Precarga el formulario de "Nueva unidad" con los datos de una unidad
  // existente (todo menos el código, que tiene que ser único) — para no
  // retipear los 18 campos cuando el mismo modelo se repite en el piso.
  const duplicateUnit = (u: UnitRow) => {
    setEditingId(null);
    setForm({ code: '', ...formFieldsFromUnit(u) });
    setError('');
    document.getElementById('code')?.focus();
  };

  // Trae los datos de una unidad de OTRO piso/edificio y precarga el
  // formulario — igual que "Duplicar" pero cruzando pisos. No copia
  // polígono/ambientes/tour porque esos dependen del plano de este piso
  // en particular, no del modelo del depto.
  const handleCopyFromUnit = async () => {
    if (!copySourceId) return;
    setCopying(true);
    const u = await fetch(`/api/admin/units/${copySourceId}`).then(res => res.json());
    setCopying(false);
    setEditingId(null);
    setForm({ code: '', ...formFieldsFromUnit(u) });
    setError('');
    setCopySourceId('');
    document.getElementById('code')?.focus();
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
      if (editingId) {
        cancelEdit();
      } else {
        // Deja cargados los mismos valores para el próximo depto — solo
        // hace falta cambiar el código — en vez de volver al form vacío.
        setForm(prev => ({ ...prev, code: '' }));
        setError('');
        document.getElementById('code')?.focus();
      }
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al guardar la unidad.');
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar esta unidad?', confirmLabel: 'Borrar unidad', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/units/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast('Unidad borrada.');
      if (editingId === id) cancelEdit();
      load();
    } else {
      toast('Error al borrar la unidad.', 'error');
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsv('plantilla-unidades.csv', [[...CSV_COLUMNS], CSV_TEMPLATE_ROW]);
  };

  const handleExportCsv = () => {
    const rows = units.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''), String(u.inner_area ?? ''),
      String(u.balcony_area ?? 0), String(u.external_area ?? 0), String(u.bedrooms ?? 0), String(u.bathrooms ?? 0),
      u.has_service_room ? 'si' : 'no', u.price != null ? String(u.price) : '', u.status, u.orientation ?? '',
      u.interior_image_url ?? '', u.floor_plan_3d_url ?? '', u.plan_3d_url ?? '', u.technical_plan_url ?? '',
    ]);
    downloadCsv('unidades.csv', [[...CSV_COLUMNS], ...rows]);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast('El CSV está vacío.', 'error'); return; }

    const header = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);
    const colIndex = (name: string) => header.indexOf(name);

    let created = 0;
    let skipped = 0;
    for (const row of dataRows) {
      const get = (name: string) => { const i = colIndex(name); return i >= 0 ? (row[i] ?? '').trim() : ''; };
      const code = get('code');
      const type = get('type');
      if (!code || !type) { skipped++; continue; }

      const payload = {
        floorId,
        code,
        modelName: get('modelName') || null,
        type,
        totalArea: get('totalArea') === '' ? null : Number(get('totalArea')),
        innerArea: get('innerArea') === '' ? null : Number(get('innerArea')),
        balconyArea: Number(get('balconyArea') || 0),
        externalArea: Number(get('externalArea') || 0),
        bedrooms: Number(get('bedrooms') || 0),
        bathrooms: Number(get('bathrooms') || 1),
        hasServiceRoom: ['si', 'sí', 'true', '1', 'yes'].includes(get('hasServiceRoom').toLowerCase()),
        price: get('price') === '' ? null : Number(get('price')),
        status: (get('status') || 'available') as UnitStatus,
        orientation: get('orientation') || null,
        interiorImageUrl: get('interiorImageUrl') || null,
        floorPlan3dUrl: get('floorPlan3dUrl') || null,
        plan3dUrl: get('plan3dUrl') || null,
        technicalPlanUrl: get('technicalPlanUrl') || null,
      };

      const res = await fetch('/api/admin/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) created++; else skipped++;
    }

    toast(`${created} unidad${created === 1 ? '' : 'es'} importada${created === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} con error/omitida${skipped === 1 ? '' : 's'}` : ''}.`, skipped > 0 && created === 0 ? 'error' : undefined);
    load();
  };

  if (loading) return <LoadingSpinner text="Cargando unidades..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudieron cargar las unidades." onRetry={load} />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Unidades</h3>
          <div className="flex items-center gap-3">
            <button type="button" onClick={handleDownloadTemplate} className="text-xs font-medium text-gray-500 hover:text-gray-700">Plantilla CSV</button>
            <button type="button" onClick={handleExportCsv} disabled={units.length === 0} className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:opacity-40">Exportar CSV</button>
            <label className="text-xs font-medium text-brand-600 hover:text-brand-700 cursor-pointer">
              Importar CSV
              <input
                type="file" accept=".csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = ''; }}
              />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
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
                    {buildingId && (
                      <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>
                    )}
                    <button onClick={() => startEdit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                    <button onClick={() => duplicateUnit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Duplicar</button>
                    <button onClick={() => handleDelete(u.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                  </td>
                </tr>
              ))}
              {units.length === 0 && (
                <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Todavía no hay unidades en este piso.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {otherUnits.length > 0 && (
        <Card>
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              ¿Este depto ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="flex-1 sm:w-64 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">Elegir unidad de referencia...</option>
                {otherUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={handleCopyFromUnit} disabled={!copySourceId || copying} className="whitespace-nowrap">
                {copying ? 'Copiando...' : 'Copiar datos'}
              </Button>
            </div>
          </div>
        </Card>
      )}

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
            El polígono del depto en el plano, los ambientes y el tour 360° se cargan en los pasos siguientes.
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
