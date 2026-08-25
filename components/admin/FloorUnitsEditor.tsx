'use client';

import { useState, useEffect, useRef } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import type { UnitType, UnitStatus, TourData, Room } from '@/types';
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
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { formatPrice } from '@/lib/units';

type UnitRow = Pick<DbUnitRow,
  | 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'inner_area' | 'balcony_area'
  | 'external_area' | 'bedrooms' | 'bathrooms' | 'has_service_room' | 'lot_size' | 'ceiling_height'
  | 'garage_spaces' | 'garage_type' | 'living_rooms' | 'kitchens' | 'other_rooms_count' | 'other_rooms_description'
  | 'hoa_fee' | 'floors_count'
  | 'price' | 'currency' | 'status'
  | 'orientation' | 'interior_image_url' | 'gallery_images' | 'floor_plan_3d_url'
  | 'plan_3d_url' | 'technical_plan_url' | 'created_at'
  | 'room_plan_image' | 'rooms' | 'tour_image_url' | 'tour_data'
>;

// Lo que "Duplicar" arrastra de la unidad de origen pero que no se ve en el
// form (los ambientes y el recorrido 360° del depto) — se manda aparte en el
// payload de creación en vez de mezclarse con los campos visibles.
type DuplicateExtras = {
  roomPlanImage: string | null;
  rooms: Room[] | null;
  tourImageUrl: string | null;
  tourData: TourData | null;
};

type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

const UNIT_TYPES: UnitType[] = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'];
// Una casa no es "monoambiente" ni "penthouse" — esos términos son de
// depto. El resto de los valores (conteo de dormitorios) sí describe bien
// una casa, así que se reusa el mismo UnitType en vez de inventar uno
// nuevo que habría que sumar a los filtros del sitio público.
const HOUSE_TYPES: UnitType[] = ['1 dormitorio', '2 dormitorios', '3 dormitorios'];

// Mismas monedas que reconoce formatPrice() en lib/units.ts — agregar acá
// una moneda sin agregarla ahí la deja guardable pero sin formato local
// específico al mostrarla (cae al genérico).
const CURRENCIES = ['USD', 'ARS', 'EUR', 'UYU', 'BRL', 'CLP', 'MXN', 'COP', 'PEN'] as const;

const CSV_COLUMNS = [
  'code', 'modelName', 'type', 'totalArea', 'innerArea', 'balconyArea', 'externalArea',
  'bedrooms', 'bathrooms', 'hasServiceRoom', 'price', 'currency', 'status', 'orientation',
  'interiorImageUrl', 'floorPlan3dUrl', 'plan3dUrl', 'technicalPlanUrl',
] as const;

const CSV_TEMPLATE_ROW = [
  'A01-01', 'SUITE GARDEN', '2 dormitorios', '65.5', '55', '10.5', '0',
  '2', '2', 'no', '150000', 'USD', 'available', 'NE', '', '', '', '',
];

const EMPTY_FORM = {
  code: '', modelName: '', type: '2 dormitorios' as UnitType,
  totalArea: '', innerArea: '', balconyArea: '0', externalArea: '0',
  bedrooms: '2', bathrooms: '2', hasServiceRoom: false,
  lotSize: '', ceilingHeight: '', hoaFee: '', floorsCount: '1',
  livingRooms: '1', kitchens: '1', otherRoomsCount: '0', otherRoomsDescription: '',
  garageSpaces: '0', garageType: 'cubierta' as 'cubierta' | 'descubierta',
  price: '', currency: 'USD', status: 'available' as UnitStatus, orientation: '',
  interiorImageUrl: '', galleryImages: [] as string[],
  floorPlan3dUrl: '', plan3dUrl: '', technicalPlanUrl: '',
};

type SourceUnitLike = {
  model_name: string | null; type: UnitType; total_area: number | null; inner_area: number | null;
  balcony_area: number | null; external_area: number | null; bedrooms: number | null; bathrooms: number | null;
  has_service_room: boolean; lot_size: number | null; ceiling_height: number | null;
  garage_spaces: number; garage_type: 'cubierta' | 'descubierta' | null;
  living_rooms: number; kitchens: number; other_rooms_count: number; other_rooms_description: string | null;
  hoa_fee: number | null; floors_count: number;
  price: number | null; currency: string; status: UnitStatus; orientation: string | null;
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
    lotSize: u.lot_size != null ? String(u.lot_size) : '',
    ceilingHeight: u.ceiling_height != null ? String(u.ceiling_height) : '',
    garageSpaces: String(u.garage_spaces ?? 0),
    garageType: u.garage_type ?? 'cubierta',
    livingRooms: String(u.living_rooms ?? 1),
    kitchens: String(u.kitchens ?? 1),
    otherRoomsCount: String(u.other_rooms_count ?? 0),
    otherRoomsDescription: u.other_rooms_description ?? '',
    hoaFee: u.hoa_fee != null ? String(u.hoa_fee) : '',
    floorsCount: String(u.floors_count ?? 1),
    price: u.price != null ? String(u.price) : '',
    currency: u.currency || 'USD',
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
//
// Tipos sin hasUnitStep (hoy: "casas") renderizan un modo distinto: acá el
// building YA ES la unidad (una casa no tiene "casas" adentro), así que en
// vez de tabla + alta múltiple se muestra directo el form de la única
// unidad del piso interno — en modo edición si ya existe, o de alta si
// todavía no. Sin tabla, sin CSV, sin "Duplicar/Borrar" (no hay lista).
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
  const [duplicateExtras, setDuplicateExtras] = useState<DuplicateExtras | null>(null);
  const toast = useToast();
  const confirmDialog = useConfirm();
  const inheritedDefaultsApplied = useRef(false);
  const singleRecordAutoEdited = useRef(false);
  const typeConfig = useProjectTypeConfig();
  const { hasUnitStep, unitLabel, buildingLabel } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  const columnCount = 4 + (typeConfig.showStatus ? 1 : 0) + (typeConfig.showPrice ? 1 : 0);

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
    setDuplicateExtras(null);
  };

  // Sin paso de unidades propio (una casa ES la unidad): en cuanto se sabe
  // que ya existe, se entra a editarla derecho — no tiene sentido mostrarle
  // al usuario un form de "alta" vacío al lado de la única fila posible.
  useEffect(() => {
    if (hasUnitStep || singleRecordAutoEdited.current || units.length === 0) return;
    singleRecordAutoEdited.current = true;
    startEdit(units[0]);
  }, [hasUnitStep, units]);

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError('');
    setDuplicateExtras(null);
  };

  // Precarga el formulario de "Nueva unidad" con los datos de una unidad
  // existente (todo menos el código, que tiene que ser único) — para no
  // retipear los 18 campos cuando el mismo modelo se repite en el piso.
  // Los deptos idénticos también comparten ambientes y recorrido 360°, así
  // que eso viaja aparte en duplicateExtras y se suma recién al crear —
  // NO el polígono, que es la posición de este depto en el plano del piso
  // y por eso es única de cada unidad.
  const duplicateUnit = (u: UnitRow) => {
    setEditingId(null);
    setForm({ code: '', ...formFieldsFromUnit(u) });
    setDuplicateExtras({
      roomPlanImage: u.room_plan_image,
      rooms: u.rooms,
      tourImageUrl: u.tour_image_url,
      tourData: u.tour_data,
    });
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
    lotSize: form.lotSize === '' ? null : Number(form.lotSize),
    ceilingHeight: form.ceilingHeight === '' ? null : Number(form.ceilingHeight),
    garageSpaces: Number(form.garageSpaces || 0),
    garageType: Number(form.garageSpaces || 0) > 0 ? form.garageType : null,
    livingRooms: Number(form.livingRooms || 0),
    kitchens: Number(form.kitchens || 0),
    otherRoomsCount: Number(form.otherRoomsCount || 0),
    otherRoomsDescription: form.otherRoomsDescription || null,
    hoaFee: form.hoaFee === '' ? null : Number(form.hoaFee),
    floorsCount: Number(form.floorsCount || 1),
    price: form.price === '' ? null : Number(form.price),
    currency: form.currency || 'USD',
    status: form.status,
    orientation: form.orientation || null,
    interiorImageUrl: form.interiorImageUrl || null,
    galleryImages: form.galleryImages.filter(Boolean),
    floorPlan3dUrl: form.floorPlan3dUrl || null,
    plan3dUrl: form.plan3dUrl || null,
    technicalPlanUrl: form.technicalPlanUrl || null,
    // Solo al crear a partir de "Duplicar" — en una edición normal
    // (editingId set) nunca hay que pisar los ambientes/tour reales de la
    // unidad con lo que haya quedado cacheado de un duplicado anterior.
    ...(!editingId && duplicateExtras ? {
      roomPlanImage: duplicateExtras.roomPlanImage,
      rooms: duplicateExtras.rooms,
      tourImageUrl: duplicateExtras.tourImageUrl,
      tourData: duplicateExtras.tourData,
    } : {}),
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
      toast(editingId ? 'Cambios guardados.' : `${unitLabel} creada.`);
      if (editingId) {
        // Para "casas" (!hasUnitStep) el form editado ES la única unidad —
        // vaciarlo tras guardar dejaba al usuario frente a una pantalla en
        // blanco que parecía "crear otra casa". Al no tener paso de
        // unidades propio, no hay a dónde volver: se queda mostrando lo
        // que se acaba de guardar.
        if (hasUnitStep) cancelEdit();
      } else if (hasUnitStep) {
        // Deja cargados los mismos valores para el próximo depto — solo
        // hace falta cambiar el código — en vez de volver al form vacío.
        setForm(prev => ({ ...prev, code: '' }));
        setError('');
        document.getElementById('code')?.focus();
      }
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Error al guardar ${uAgree.el} ${unitLabelLower}.`);
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirmDialog({ message: `¿Borrar ${uAgree.esta} ${unitLabelLower}?`, confirmLabel: `Borrar ${unitLabelLower}`, danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/units/${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast(`${unitLabel} ${uAgree.borrado}.`);
      if (editingId === id) cancelEdit();
      load();
    } else {
      toast(`Error al borrar ${uAgree.el} ${unitLabelLower}.`, 'error');
    }
  };

  const handleDownloadTemplate = () => {
    downloadCsv('plantilla-unidades.csv', [[...CSV_COLUMNS], CSV_TEMPLATE_ROW]);
  };

  const handleExportCsv = () => {
    const rows = units.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''), String(u.inner_area ?? ''),
      String(u.balcony_area ?? 0), String(u.external_area ?? 0), String(u.bedrooms ?? 0), String(u.bathrooms ?? 0),
      u.has_service_room ? 'si' : 'no', u.price != null ? String(u.price) : '', u.currency || 'USD', u.status, u.orientation ?? '',
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
        currency: get('currency') || 'USD',
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

    toast(`${created} ${unitLabelLower}${created === 1 ? '' : 's'} importada${created === 1 ? '' : 's'}${skipped > 0 ? `, ${skipped} con error/omitida${skipped === 1 ? '' : 's'}` : ''}.`, skipped > 0 && created === 0 ? 'error' : undefined);
    load();
  };

  if (loading) return <LoadingSpinner text={hasUnitStep ? `Cargando ${unitLabelLower}s...` : `Cargando datos ${uAgree.del} ${unitLabelLower}...`} tone="light" />;
  if (loadError) return <ErrorState message={hasUnitStep ? `No se pudieron cargar ${uAgree.el === 'la' ? 'las' : 'los'} ${unitLabelLower}s.` : `No se pudieron cargar los datos ${uAgree.del} ${unitLabelLower}.`} onRetry={load} />;

  return (
    <div className="space-y-6">
      {hasUnitStep && (
        <Card>
          <div className="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{unitLabel}s</h3>
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
                  {typeConfig.showStatus && <th className="px-6 py-3 text-sm font-semibold text-gray-900">Estado</th>}
                  {typeConfig.showPrice && <th className="px-6 py-3 text-sm font-semibold text-gray-900">Precio</th>}
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {units.map(u => (
                  <tr key={u.id} className={`hover:bg-gray-50/50 transition-colors ${editingId === u.id ? 'bg-brand-50/50' : ''}`}>
                    <td className="px-6 py-3 font-medium text-gray-900">{u.code}</td>
                    <td className="px-6 py-3 text-sm text-gray-600">{u.model_name} <span className="text-gray-400">· {u.type}</span></td>
                    <td className="px-6 py-3 text-sm text-gray-600">{u.total_area ?? '—'}</td>
                    {typeConfig.showStatus && (
                      <td className="px-6 py-3 text-sm">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium
                          ${u.status === 'available' ? 'bg-green-50 text-green-700' : ''}
                          ${u.status === 'reserved' ? 'bg-yellow-50 text-yellow-700' : ''}
                          ${u.status === 'sold' ? 'bg-red-50 text-red-700' : ''}`}>
                          {u.status}
                        </span>
                      </td>
                    )}
                    {typeConfig.showPrice && (
                      <td className="px-6 py-3 text-sm text-gray-600">{u.price ? formatPrice(u.price, u.currency) : '—'}</td>
                    )}
                    <td className="px-6 py-3 text-right space-x-3 whitespace-nowrap">
                      {buildingId && (
                        <>
                          <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ambientes</Link>
                          <Link
                            href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}/tour`}
                            className="text-sm font-medium text-brand-600 hover:text-brand-700"
                            title={u.tour_data?.nodes.length ? `${u.tour_data.nodes.length} panorámica${u.tour_data.nodes.length === 1 ? '' : 's'} cargada${u.tour_data.nodes.length === 1 ? '' : 's'}` : 'Todavía sin recorrido 360°'}
                          >
                            Recorrido 360°{u.tour_data?.nodes.length ? ` (${u.tour_data.nodes.length})` : ''}
                          </Link>
                        </>
                      )}
                      <button onClick={() => startEdit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Editar</button>
                      <button onClick={() => duplicateUnit(u)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Duplicar</button>
                      <button onClick={() => handleDelete(u.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                    </td>
                  </tr>
                ))}
                {units.length === 0 && (
                  <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-gray-400">Todavía no hay {unitLabelLower}s en {uAgree.esta} {buildingLabelLower}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {otherUnits.length > 0 && (
        <Card>
          <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm text-gray-600 flex-1">
              {hasUnitStep
                ? '¿Este depto ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.'
                : `¿Ya cargaste ${uAgree.un} ${unitLabelLower} con los mismos datos (ej: la misma planta tipo)? Copiá sus datos en vez de retipearlos.`}
            </p>
            <div className="flex gap-2 w-full sm:w-auto">
              <select
                value={copySourceId}
                onChange={e => setCopySourceId(e.target.value)}
                className="flex-1 sm:w-64 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none"
              >
                <option value="">{`Elegir ${unitLabelLower} de referencia...`}</option>
                {otherUnits.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{hasUnitStep && u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
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
          <h3 className="text-lg font-semibold text-gray-900">
            {hasUnitStep
              ? (editingId ? `Editando ${form.code}` : `Nueva ${unitLabelLower}`)
              : (editingId ? `Datos de ${form.code || buildingLabelLower}` : `Datos de ${uAgree.esta} ${buildingLabelLower}`)}
          </h3>
        </CardHeader>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input
              label={hasUnitStep ? 'Código' : 'Código interno'}
              id="code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder={hasUnitStep ? 'A01-01' : buildingLabel.toUpperCase() + '-1'} required
            />
            <Input label="Modelo" id="modelName" value={form.modelName} onChange={e => setForm({ ...form, modelName: e.target.value })} placeholder="SUITE GARDEN" />
            <Select label="Tipología" id="type" value={form.type} onChange={e => setForm({ ...form, type: e.target.value as UnitType })}>
              {(hasUnitStep ? UNIT_TYPES : HOUSE_TYPES).map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            {typeConfig.showStatus && (
              <Select label="Estado" id="status" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as UnitStatus })}>
                <option value="available">Disponible</option>
                <option value="reserved">Reservado</option>
                <option value="sold">Vendido</option>
              </Select>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Área total (m²)" id="totalArea" type="number" step="0.01" value={form.totalArea} onChange={e => setForm({ ...form, totalArea: e.target.value })} />
            <Input label="Área interna (m²)" id="innerArea" type="number" step="0.01" value={form.innerArea} onChange={e => setForm({ ...form, innerArea: e.target.value })} />
            {hasUnitStep && (
              <Input label="Balcón (m²)" id="balconyArea" type="number" step="0.01" value={form.balconyArea} onChange={e => setForm({ ...form, balconyArea: e.target.value })} />
            )}
            <Input label="Área externa (m²)" id="externalArea" type="number" step="0.01" value={form.externalArea} onChange={e => setForm({ ...form, externalArea: e.target.value })} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Input label="Dormitorios" id="bedrooms" type="number" min={0} value={form.bedrooms} onChange={e => setForm({ ...form, bedrooms: e.target.value })} />
            <Input label="Baños" id="bathrooms" type="number" min={0} step="0.5" value={form.bathrooms} onChange={e => setForm({ ...form, bathrooms: e.target.value })} />
            {typeConfig.showPrice && (
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <Input label="Precio" id="price" type="number" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} placeholder="Consultar precio" />
                </div>
                <div className="w-24 shrink-0">
                  <Select label="Moneda" id="currency" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                    {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </div>
              </div>
            )}
            <Input label="Orientación" id="orientation" value={form.orientation} onChange={e => setForm({ ...form, orientation: e.target.value })} placeholder="NE" />
          </div>

          {!hasUnitStep && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Superficie de terreno (m²)" id="lotSize" type="number" step="0.01" value={form.lotSize} onChange={e => setForm({ ...form, lotSize: e.target.value })} />
                <Input label="Altura de techo (m)" id="ceilingHeight" type="number" step="0.01" value={form.ceilingHeight} onChange={e => setForm({ ...form, ceilingHeight: e.target.value })} placeholder="2.60" />
                <Input label="Cantidad de plantas" id="floorsCount" type="number" min={1} value={form.floorsCount} onChange={e => setForm({ ...form, floorsCount: e.target.value })} />
                {typeConfig.showPrice && (
                  <Input label="Expensas / mes" id="hoaFee" type="number" step="0.01" value={form.hoaFee} onChange={e => setForm({ ...form, hoaFee: e.target.value })} placeholder="Sin expensas" />
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Livings" id="livingRooms" type="number" min={0} value={form.livingRooms} onChange={e => setForm({ ...form, livingRooms: e.target.value })} />
                <Input label="Cocinas" id="kitchens" type="number" min={0} value={form.kitchens} onChange={e => setForm({ ...form, kitchens: e.target.value })} />
                <Input label="Otros ambientes" id="otherRoomsCount" type="number" min={0} value={form.otherRoomsCount} onChange={e => setForm({ ...form, otherRoomsCount: e.target.value })} placeholder="0" />
                <Input label="Detalle otros ambientes" id="otherRoomsDescription" value={form.otherRoomsDescription} onChange={e => setForm({ ...form, otherRoomsDescription: e.target.value })} placeholder="Lavadero, depósito" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Input label="Cantidad de cocheras" id="garageSpaces" type="number" min={0} value={form.garageSpaces} onChange={e => setForm({ ...form, garageSpaces: e.target.value })} />
                {Number(form.garageSpaces || 0) > 0 && (
                  <Select label="Tipo de cochera" id="garageType" value={form.garageType} onChange={e => setForm({ ...form, garageType: e.target.value as 'cubierta' | 'descubierta' })}>
                    <option value="cubierta">Cubierta</option>
                    <option value="descubierta">Descubierta</option>
                  </Select>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={form.hasServiceRoom} onChange={e => setForm({ ...form, hasServiceRoom: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              Tiene cuarto de servicio
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ImageUploader label="Foto interior" value={form.interiorImageUrl} onChange={url => setForm({ ...form, interiorImageUrl: url })} folder="units" />
            <ImageUploader label="Render / planta 3D" value={form.floorPlan3dUrl} onChange={url => setForm({ ...form, floorPlan3dUrl: url })} folder="floorplans" />
            <ImageUploader label="Plano 3D técnico" value={form.plan3dUrl} onChange={url => setForm({ ...form, plan3dUrl: url })} folder="floorplans" />
            <ImageUploader label="Plano 2D técnico" value={form.technicalPlanUrl} onChange={url => setForm({ ...form, technicalPlanUrl: url })} folder="floorplans" />
          </div>

          <MultiImageUploader label="Galería" values={form.galleryImages} onChange={urls => setForm({ ...form, galleryImages: urls })} folder="units" />

          <p className="text-xs text-gray-500">
            {hasUnitStep
              ? 'El polígono del depto en el plano, los ambientes y el tour 360° se cargan en los pasos siguientes.'
              : 'Los ambientes (incluida una pileta u otro espacio propio, si tiene) y el tour 360° se cargan en el paso siguiente.'}
          </p>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="pt-4 border-t border-gray-100 flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : hasUnitStep ? `+ Crear ${unitLabelLower}` : 'Guardar'}
            </Button>
            {editingId && hasUnitStep && (
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
