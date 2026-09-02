'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import dynamic from 'next/dynamic';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement } from '@/lib/project-types';
import { getStatusLabel, formatPrice } from '@/lib/units';
import { parseCsv, downloadCsv } from '@/lib/csv';
import { UNIT_STATUSES } from '@/lib/validate';
import type { UnitStatus, UnitType } from '@/types';
import type { UnitRow as DbUnitRow } from '@/types/database';

// Recorrido 360° del depto — pesado (VirtualTour, panoramas). Solo se
// carga cuando hay una unidad de vivienda seleccionada.
const TourEditor = dynamic(() => import('@/components/admin/TourEditor'), {
  loading: () => <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />,
});

type UnitRow = Pick<DbUnitRow,
  | 'id' | 'code' | 'total_area' | 'status' | 'price' | 'currency'
  | 'interior_image_url' | 'gallery_images' | 'polygon'
  | 'model_name' | 'type' | 'inner_area' | 'balcony_area' | 'external_area'
  | 'bedrooms' | 'bathrooms' | 'has_service_room' | 'orientation'
  | 'floor_plan_3d_url' | 'plan_3d_url' | 'technical_plan_url' | 'tour_data'
>;

type OtherUnitRow = Pick<DbUnitRow, 'id' | 'code'> & {
  building_name: string | null;
  floor_number: number | null;
};

type Filter = 'all' | 'available' | 'noPhoto' | 'noPlano';
type View = 'table' | 'grid';

const STATUS_PILL_BG: Record<UnitStatus, string> = {
  available: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  reserved: 'bg-amber-50 border-amber-200 text-amber-700',
  sold: 'bg-gray-100 border-gray-200 text-gray-600',
};

// Lote: sin tipología (es terreno). Depto/dúplex/único: lista curada fija
// (a diferencia de casa, que deriva el tipo de la cantidad de dormitorios).
const UNIT_TYPES: UnitType[] = ['monoambiente', '1 dormitorio', '2 dormitorios', '3 dormitorios', 'penthouse'];

const LAND_CSV_COLUMNS = ['code', 'totalArea', 'status', 'price', 'currency', 'interiorImageUrl'] as const;
const LAND_CSV_TEMPLATE_ROW = ['04', '480', 'available', '', 'USD', ''];
const DWELLING_CSV_COLUMNS = [
  'code', 'modelName', 'type', 'totalArea', 'innerArea', 'balconyArea', 'externalArea',
  'bedrooms', 'bathrooms', 'hasServiceRoom', 'price', 'currency', 'status', 'orientation',
  'interiorImageUrl', 'floorPlan3dUrl', 'plan3dUrl', 'technicalPlanUrl',
] as const;
const DWELLING_CSV_TEMPLATE_ROW = [
  'A01-01', 'SUITE GARDEN', '2 dormitorios', '65.5', '55', '10.5', '0',
  '2', '2', 'no', '150000', 'USD', 'available', 'NE', '', '', '', '',
];

// Editor de unidades de un piso — lista tabla/grid + panel lateral, CSV
// import/export, selección múltiple. Habla directo con /api/admin/units.
// Para un lote (unitIsLand) solo usa los campos que un lote tiene: código,
// superficie, estado, precio, fotos y si ya está delimitado en el plano
// (derivado de units.polygon). Para el resto de tipos con lista de
// unidades (edificio/dúplex/único) suma los campos de vivienda — modelo,
// tipología, dormitorios/baños, orientación, planos 3D, recorrido 360° y
// "copiar de otra unidad". Casa no pasa por acá (ver FloorUnitsEditor):
// es un registro único, sin lista que mostrar. El polígono propio de la
// unidad se sigue delimitando aparte, en /plano — eso no cambia acá.
export default function UnitsEditor({ buildingId, floorId, buildingName }: { buildingId: string; floorId: string; buildingName: string }) {
  const typeConfig = useProjectTypeConfig();
  const { unitLabel, showStatus, showPrice, unitIsLand } = typeConfig;
  const unitLabelLower = unitLabel.toLowerCase();
  const uAgree = unitAgreement(typeConfig);
  const losLas = uAgree.el === 'la' ? 'las' : 'los';

  const [units, setUnits] = useState<UnitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<View>('table');
  const [csvOpen, setCsvOpen] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'code' | 'm2' } | null>(null);
  const [newCode, setNewCode] = useState('');
  const [newM2, setNewM2] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [savedLabel, setSavedLabel] = useState('Todo guardado');
  const [allProjectUnits, setAllProjectUnits] = useState<OtherUnitRow[]>([]);
  const [copySourceId, setCopySourceId] = useState('');
  const [copying, setCopying] = useState(false);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch(`/api/admin/units?floorId=${floorId}`)
      .then(res => { if (!res.ok) throw new Error('request failed'); return res.json(); })
      .then((data: UnitRow[]) => {
        setUnits(data);
        setSel(prev => prev && data.some(u => u.id === prev) ? prev : (data[0]?.id ?? null));
        setLoading(false);
      })
      .catch(err => { console.error(err); setLoadError(true); setLoading(false); });
  };

  useEffect(load, [floorId]);

  // Unidades de CUALQUIER otro piso/edificio del proyecto — para poder
  // traer el mismo modelo a este piso sin retipear los campos, cuando el
  // depto ya existe en otra torre o en un piso con layout distinto. No
  // aplica a lotes (cada uno es su propio terreno, nada que "copiar").
  useEffect(() => {
    if (unitIsLand) return;
    fetch('/api/admin/units')
      .then(res => res.json())
      .then((data: OtherUnitRow[]) => setAllProjectUnits(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [unitIsLand]);
  const otherUnits = useMemo(
    () => allProjectUnits.filter(u => !units.some(un => un.id === u.id)),
    [allProjectUnits, units],
  );

  const patch = async (id: string, updates: Record<string, unknown>) => {
    setUnits(prev => prev.map(u => (u.id === id ? { ...u, ...dbShape(updates) } : u)));
    setSaving(true);
    const res = await fetch(`/api/admin/units/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
    });
    setSaving(false);
    if (res.ok) setSavedLabel('Guardado hace un instante');
    else { toast(`No se pudo guardar ${unitLabelLower}.`, 'error'); load(); }
    return res.ok;
  };

  // El estado optimista de arriba pisa con las mismas keys en camelCase que
  // manda el PATCH — esto las traduce a las columnas snake_case del row.
  function dbShape(updates: Record<string, unknown>): Partial<UnitRow> {
    const map: Record<string, keyof UnitRow> = {
      code: 'code', totalArea: 'total_area', status: 'status', price: 'price', currency: 'currency',
      interiorImageUrl: 'interior_image_url', galleryImages: 'gallery_images',
      modelName: 'model_name', type: 'type', innerArea: 'inner_area', balconyArea: 'balcony_area',
      externalArea: 'external_area', bedrooms: 'bedrooms', bathrooms: 'bathrooms',
      hasServiceRoom: 'has_service_room', orientation: 'orientation',
      floorPlan3dUrl: 'floor_plan_3d_url', plan3dUrl: 'plan_3d_url', technicalPlanUrl: 'technical_plan_url',
      tourData: 'tour_data',
    };
    const out: Partial<UnitRow> = {};
    for (const [k, v] of Object.entries(updates)) {
      const col = map[k];
      if (col) (out as Record<string, unknown>)[col] = v;
    }
    return out;
  }

  const addUnit = async () => {
    const code = newCode.trim();
    if (!code) return;
    const res = await fetch('/api/admin/units', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ floorId, type: unitIsLand ? 'lote' : UNIT_TYPES[0], code, totalArea: newM2 === '' ? null : Number(newM2) }),
    });
    if (res.ok) {
      const created = await res.json();
      setUnits(prev => [...prev, created]);
      setSel(created.id);
      setNewCode(''); setNewM2('');
      setSavedLabel(`${unitLabel} creado`);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? `No se pudo crear ${unitLabelLower}.`, 'error');
    }
  };

  const duplicateUnits = async (ids: string[]) => {
    const targets = units.filter(u => ids.includes(u.id));
    const created: UnitRow[] = [];
    for (const u of targets) {
      const res = await fetch('/api/admin/units', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          floorId, type: unitIsLand ? 'lote' : u.type, code: `${u.code}-copia`, totalArea: u.total_area, status: u.status,
          price: u.price, currency: u.currency, interiorImageUrl: u.interior_image_url, galleryImages: u.gallery_images,
          ...(!unitIsLand ? {
            modelName: u.model_name, innerArea: u.inner_area, balconyArea: u.balcony_area, externalArea: u.external_area,
            bedrooms: u.bedrooms, bathrooms: u.bathrooms, hasServiceRoom: u.has_service_room, orientation: u.orientation,
            floorPlan3dUrl: u.floor_plan_3d_url, plan3dUrl: u.plan_3d_url, technicalPlanUrl: u.technical_plan_url,
            tourData: u.tour_data,
          } : {}),
        }),
      });
      if (res.ok) created.push(await res.json());
    }
    if (created.length) {
      setUnits(prev => [...prev, ...created]);
      setSavedLabel(`${created.length} ${unitLabelLower}${created.length === 1 ? '' : 's'} duplicad${created.length === 1 ? 'o' : 'os'}`);
    }
    setSelectedIds(new Set());
  };

  const handleCopyFromUnit = async () => {
    if (!copySourceId || !sel) return;
    setCopying(true);
    const u = await fetch(`/api/admin/units/${copySourceId}`).then(res => res.json());
    setCopying(false);
    await patch(sel, {
      modelName: u.model_name, type: u.type, totalArea: u.total_area, innerArea: u.inner_area,
      balconyArea: u.balcony_area, externalArea: u.external_area, bedrooms: u.bedrooms, bathrooms: u.bathrooms,
      hasServiceRoom: u.has_service_room, price: u.price, currency: u.currency, status: u.status,
      orientation: u.orientation, floorPlan3dUrl: u.floor_plan_3d_url, plan3dUrl: u.plan_3d_url, technicalPlanUrl: u.technical_plan_url,
    });
    setCopySourceId('');
  };

  const removeUnits = async (ids: string[]) => {
    const ok = await confirmDialog({
      message: ids.length === 1 ? `¿Borrar este ${unitLabelLower}? No se puede deshacer.` : `¿Borrar ${ids.length} ${unitLabelLower}s? No se puede deshacer.`,
      confirmLabel: 'Borrar', danger: true,
    });
    if (!ok) return;
    const results = await Promise.all(ids.map(id => fetch(`/api/admin/units/${id}`, { method: 'DELETE' }).then(r => r.ok)));
    const removedIds = ids.filter((_, i) => results[i]);
    setUnits(prev => prev.filter(u => !removedIds.includes(u.id)));
    setSelectedIds(new Set());
    setSel(prev => (prev && removedIds.includes(prev) ? null : prev));
    const failed = ids.length - removedIds.length;
    setSavedLabel(`${removedIds.length} ${unitLabelLower}${removedIds.length === 1 ? '' : 's'} borrad${removedIds.length === 1 ? 'o' : 'os'}`);
    if (failed > 0) toast(`${failed} no se pudo${failed === 1 ? '' : 'ieron'} borrar.`, 'error');
  };

  const bulkStatus = async (status: UnitStatus) => {
    const ids = Array.from(selectedIds);
    await Promise.all(ids.map(id => patch(id, { status })));
    setSelectedIds(new Set());
  };

  const csvColumns = unitIsLand ? LAND_CSV_COLUMNS : DWELLING_CSV_COLUMNS;

  const handleDownloadTemplate = () => downloadCsv(`plantilla-${unitLabelLower}s.csv`, [[...csvColumns], unitIsLand ? LAND_CSV_TEMPLATE_ROW : DWELLING_CSV_TEMPLATE_ROW]);

  const handleExportCsv = () => {
    const rows = units.map(u => unitIsLand ? [
      u.code, String(u.total_area ?? ''), u.status, u.price != null ? String(u.price) : '', u.currency || 'USD', u.interior_image_url ?? '',
    ] : [
      u.code, u.model_name ?? '', u.type ?? '', String(u.total_area ?? ''), String(u.inner_area ?? ''),
      String(u.balcony_area ?? 0), String(u.external_area ?? 0), String(u.bedrooms ?? 0), String(u.bathrooms ?? 0),
      u.has_service_room ? 'si' : 'no', u.price != null ? String(u.price) : '', u.currency || 'USD', u.status, u.orientation ?? '',
      u.interior_image_url ?? '', u.floor_plan_3d_url ?? '', u.plan_3d_url ?? '', u.technical_plan_url ?? '',
    ]);
    downloadCsv(`${unitLabelLower}s.csv`, [[...csvColumns], ...rows]);
  };

  const handleImportCsv = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) { toast('El CSV está vacío.', 'error'); return; }
    const header = rows[0].map(h => h.trim());
    const dataRows = rows.slice(1);
    const colIndex = (name: string) => header.indexOf(name);
    const byCode = new Map(units.map(u => [u.code, u.id]));

    let created = 0, updated = 0, skipped = 0;
    for (const row of dataRows) {
      const get = (name: string) => { const i = colIndex(name); return i >= 0 ? (row[i] ?? '').trim() : ''; };
      const code = get('code');
      if (!code) { skipped++; continue; }
      const status = get('status') || 'available';
      if (!UNIT_STATUSES.includes(status as UnitStatus)) { skipped++; continue; }
      const payload: Record<string, unknown> = unitIsLand ? {
        code,
        totalArea: get('totalArea') === '' ? null : Number(get('totalArea')),
        status,
        price: get('price') === '' ? null : Number(get('price')),
        currency: get('currency') || 'USD',
        interiorImageUrl: get('interiorImageUrl') || null,
      } : {
        code,
        modelName: get('modelName') || null,
        type: get('type') || UNIT_TYPES[0],
        totalArea: get('totalArea') === '' ? null : Number(get('totalArea')),
        innerArea: get('innerArea') === '' ? null : Number(get('innerArea')),
        balconyArea: Number(get('balconyArea') || 0),
        externalArea: Number(get('externalArea') || 0),
        bedrooms: Number(get('bedrooms') || 0),
        bathrooms: Number(get('bathrooms') || 1),
        hasServiceRoom: ['si', 'sí', 'true', '1', 'yes'].includes(get('hasServiceRoom').toLowerCase()),
        price: get('price') === '' ? null : Number(get('price')),
        currency: get('currency') || 'USD',
        status,
        orientation: get('orientation') || null,
        interiorImageUrl: get('interiorImageUrl') || null,
        floorPlan3dUrl: get('floorPlan3dUrl') || null,
        plan3dUrl: get('plan3dUrl') || null,
        technicalPlanUrl: get('technicalPlanUrl') || null,
      };
      const existingId = byCode.get(code);
      const res = existingId
        ? await fetch(`/api/admin/units/${existingId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/admin/units', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, floorId, ...(unitIsLand ? { type: 'lote' } : {}) }) });
      if (res.ok) { if (existingId) updated++; else created++; } else skipped++;
    }
    toast(`${created} creado${created === 1 ? '' : 's'}, ${updated} actualizado${updated === 1 ? '' : 's'}${skipped ? `, ${skipped} con error` : ''}.`, skipped > 0 && created + updated === 0 ? 'error' : undefined);
    load();
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => units.filter(u => {
    if (q && !u.code.toLowerCase().includes(q)) return false;
    if (filter === 'available') return u.status === 'available';
    if (filter === 'noPhoto') return !u.interior_image_url && (u.gallery_images ?? []).length === 0;
    if (filter === 'noPlano') return !u.polygon || u.polygon.length === 0;
    return true;
  }), [units, q, filter]);

  const counts = {
    all: units.length,
    available: units.filter(u => u.status === 'available').length,
    noPhoto: units.filter(u => !u.interior_image_url && (u.gallery_images ?? []).length === 0).length,
    noPlano: units.filter(u => !u.polygon || u.polygon.length === 0).length,
  };
  const totalM2 = units.reduce((a, u) => a + (u.total_area ?? 0), 0);
  const allVisibleSelected = visible.length > 0 && visible.every(u => selectedIds.has(u.id));

  const toggleSelected = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelectedIds(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) visible.forEach(u => next.delete(u.id));
    else visible.forEach(u => next.add(u.id));
    return next;
  });

  const cur = units.find(u => u.id === sel) ?? null;
  const curIdx = cur ? units.indexOf(cur) : -1;
  const planoHref = `/admin/edificios/${buildingId}/pisos/${floorId}/plano`;

  if (loading) return <LoadingSpinner text={`Cargando ${unitLabelLower}s...`} tone="light" />;
  if (loadError) return <ErrorState message={`No se pudieron cargar ${losLas} ${unitLabelLower}s.`} onRetry={load} />;

  return (
    <div className="flex flex-col xl:flex-row gap-6 xl:items-stretch xl:h-[calc(100vh-4rem)]">
      {/* ── Lista ─────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 w-full flex flex-col gap-4 xl:h-full xl:overflow-hidden">
        <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href={`/admin/edificios/${buildingId}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName}</Link>
            <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{unitLabel}s de {buildingName}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setCsvOpen(o => !o)}
              className={`h-9 px-3.5 rounded-lg text-sm font-medium border transition-colors ${csvOpen ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-200 text-gray-900 hover:border-gray-300'}`}
            >
              CSV ▾
            </button>
            <Link
              href={planoHref}
              className="h-9 px-4 flex items-center bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              Delimitar en el plano →
            </Link>
          </div>
        </div>

        {csvOpen && (
          <div className="shrink-0 bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="flex-1 text-xs text-gray-600 leading-relaxed">
              Para cargar muchos {unitLabelLower}s de una: bajá la plantilla, completala en Excel y volvé a subirla. Los códigos repetidos se actualizan en vez de duplicarse.
            </p>
            <div className="flex gap-2 shrink-0">
              <button type="button" onClick={handleDownloadTemplate} className="h-8 px-3 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:border-gray-300 transition-colors">Plantilla</button>
              <button type="button" onClick={handleExportCsv} disabled={units.length === 0} className="h-8 px-3 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:border-gray-300 disabled:opacity-40 transition-colors">Exportar</button>
              <label className="h-8 px-3 flex items-center bg-gray-900 text-white rounded-lg text-xs font-medium cursor-pointer hover:bg-gray-800 transition-colors">
                Importar
                <input type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleImportCsv(f); e.target.value = ''; }} />
              </label>
            </div>
          </div>
        )}

        <div className="shrink-0 flex gap-2.5 flex-wrap">
          <StatCard value={counts.all} label={`${unitLabelLower}s cargados`} active={filter === 'all'} onClick={() => setFilter('all')} />
          {showStatus && <StatCard value={counts.available} label="disponibles" color="#3f5a3c" active={filter === 'available'} onClick={() => setFilter('available')} />}
          <StatCard value={counts.noPhoto} label="sin foto" color={counts.noPhoto ? '#8a6118' : undefined} active={filter === 'noPhoto'} onClick={() => setFilter('noPhoto')} />
          <StatCard value={counts.noPlano} label="sin marcar en el plano" color={counts.noPlano ? '#8a6118' : undefined} active={filter === 'noPlano'} onClick={() => setFilter('noPlano')} />
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <div className="relative w-56 shrink-0">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar por código…"
              className="h-8 w-full pl-7 pr-2.5 text-xs rounded-lg border border-gray-200 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
            />
            <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">⌕</span>
          </div>
          <div className="flex-1" />
          <div className="inline-flex bg-gray-100 rounded-lg p-1">
            <button type="button" onClick={() => setView('table')} className={`h-6 px-3 rounded-md text-xs font-medium transition-colors ${view === 'table' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Tabla</button>
            <button type="button" onClick={() => setView('grid')} className={`h-6 px-3 rounded-md text-xs font-medium transition-colors ${view === 'grid' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Fotos</button>
          </div>
        </div>

        {selectedIds.size > 0 && (
          <div className="shrink-0 bg-gray-900 rounded-xl px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <p className="flex-1 min-w-0 text-sm font-medium text-white">{selectedIds.size} {unitLabelLower}{selectedIds.size === 1 ? '' : 's'} seleccionad{selectedIds.size === 1 ? 'o' : 'os'}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {showStatus && UNIT_STATUSES.map(s => (
                <button key={s} type="button" onClick={() => bulkStatus(s)} className="h-7 px-2.5 border border-white/25 rounded-md text-xs font-medium text-white/90 hover:bg-white/10 transition-colors">
                  {getStatusLabel(s)}
                </button>
              ))}
              <button type="button" onClick={() => duplicateUnits(Array.from(selectedIds))} className="h-7 px-2.5 border border-white/25 rounded-md text-xs font-medium text-white/90 hover:bg-white/10 transition-colors">Duplicar</button>
              <button type="button" onClick={() => removeUnits(Array.from(selectedIds))} className="h-7 px-2.5 border border-red-400/50 rounded-md text-xs font-medium text-red-300 hover:bg-red-500/15 transition-colors">Borrar</button>
              <button type="button" onClick={() => setSelectedIds(new Set())} aria-label="Deseleccionar todo" className="w-7 h-7 flex items-center justify-center text-white/60 hover:text-white">×</button>
            </div>
          </div>
        )}

        {view === 'table' ? (
          <Card className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-0 px-3.5 h-9 border-b border-gray-100 bg-gray-50/60">
              <HeadCheck checked={allVisibleSelected} onChange={toggleSelectAll} />
              <span className="w-24 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Código</span>
              {!unitIsLand && <span className="w-32 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Modelo/Tipo</span>}
              <span className="w-28 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Superficie</span>
              {showStatus && <span className="w-32 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Estado</span>}
              {showPrice && <span className="w-28 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Precio</span>}
              <span className="w-20 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Fotos</span>
              <span className="w-28 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Plano</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              {visible.map(u => {
                const isSel = sel === u.id;
                const delimited = !!u.polygon && u.polygon.length > 0;
                const photoCount = (u.interior_image_url ? 1 : 0) + (u.gallery_images ?? []).length;
                const editing = editingCell?.id === u.id ? editingCell.field : null;
                return (
                  <div
                    key={u.id}
                    onClick={() => setSel(u.id)}
                    className={`flex items-center px-3.5 py-2 border-b border-gray-50 cursor-pointer transition-colors ${isSel ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                  >
                    <HeadCheck checked={selectedIds.has(u.id)} onChange={() => toggleSelected(u.id)} stop />
                    <span className="w-24 shrink-0">
                      {editing === 'code' ? (
                        <input
                          autoFocus defaultValue={u.code}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => { patch(u.id, { code: e.target.value }); setEditingCell(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="h-7 w-20 px-1.5 border border-brand-500 rounded text-xs font-semibold outline-none"
                        />
                      ) : (
                        <span onClick={e => { e.stopPropagation(); setEditingCell({ id: u.id, field: 'code' }); setSel(u.id); }} className="inline-flex h-7 items-center px-1.5 rounded hover:bg-gray-100 text-xs font-semibold text-gray-900">
                          {u.code}
                        </span>
                      )}
                    </span>
                    {!unitIsLand && (
                      <span className="w-32 shrink-0 truncate text-xs text-gray-700 pr-2" onClick={e => e.stopPropagation()}>
                        {u.model_name || u.type || '—'}
                      </span>
                    )}
                    <span className="w-28 shrink-0">
                      {editing === 'm2' ? (
                        <input
                          type="number" autoFocus defaultValue={u.total_area ?? ''}
                          onClick={e => e.stopPropagation()}
                          onBlur={e => { patch(u.id, { totalArea: e.target.value === '' ? null : Number(e.target.value) }); setEditingCell(null); }}
                          onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="h-7 w-20 px-1.5 border border-brand-500 rounded text-xs outline-none"
                        />
                      ) : (
                        <span onClick={e => { e.stopPropagation(); setEditingCell({ id: u.id, field: 'm2' }); setSel(u.id); }} className={`inline-flex h-7 items-center px-1.5 rounded hover:bg-gray-100 text-xs ${u.total_area ? 'text-gray-700' : 'text-gray-350'}`}>
                          {u.total_area ? `${u.total_area} m²` : '—'}
                        </span>
                      )}
                    </span>
                    {showStatus && (
                      <span className="w-32 shrink-0" onClick={e => e.stopPropagation()}>
                        <select
                          value={u.status}
                          onChange={e => patch(u.id, { status: e.target.value })}
                          className={`h-7 w-[118px] rounded-full text-[11px] font-medium border outline-none cursor-pointer text-center ${STATUS_PILL_BG[u.status]}`}
                        >
                          {UNIT_STATUSES.map(s => <option key={s} value={s}>{getStatusLabel(s)}</option>)}
                        </select>
                      </span>
                    )}
                    {showPrice && (
                      <span className="w-28 shrink-0 text-xs text-gray-700" onClick={e => e.stopPropagation()}>
                        <input
                          type="number" defaultValue={u.price ?? ''}
                          onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== u.price) patch(u.id, { price: v }); }}
                          placeholder="—"
                          className="h-7 w-24 px-1.5 border border-transparent hover:border-gray-200 focus:border-brand-500 rounded text-xs outline-none"
                        />
                      </span>
                    )}
                    <span className="w-20 shrink-0 flex items-center gap-1.5">
                      <span className={`w-7 h-5 rounded ${photoCount ? 'bg-gray-100' : 'bg-gray-50 border border-dashed border-gray-200'}`} />
                      <span className={`text-[11px] font-medium ${photoCount ? 'text-gray-500' : 'text-amber-700'}`}>{photoCount}</span>
                    </span>
                    <span className="w-28 shrink-0">
                      <span className={`inline-flex h-6 items-center px-2.5 rounded-full text-[10.5px] font-medium border ${delimited ? 'bg-brand-50 border-brand-200 text-brand-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                        {delimited ? '✓ Delimitado' : 'Sin marcar'}
                      </span>
                    </span>
                    <span className="flex-1" />
                    <span className="shrink-0 flex items-center gap-1">
                      {!unitIsLand && (
                        <Link
                          href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${u.id}`}
                          onClick={e => e.stopPropagation()}
                          title="Ambientes"
                          className="h-7 px-2 flex items-center rounded-md text-[11px] font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          Ambientes
                        </Link>
                      )}
                      <button type="button" title="Duplicar" onClick={e => { e.stopPropagation(); duplicateUnits([u.id]); }} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">⧉</button>
                      <button type="button" title="Borrar" onClick={e => { e.stopPropagation(); removeUnits([u.id]); }} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                    </span>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div className="py-11 flex flex-col items-center gap-1.5 text-center px-6">
                  <p className="text-sm font-medium text-gray-900">Ningún {unitLabelLower} coincide con este filtro</p>
                  <button type="button" onClick={() => { setFilter('all'); setQuery(''); }} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ver todos {losLas} {unitLabelLower}s</button>
                </div>
              )}
            </div>
            <div className="shrink-0 border-t border-gray-100 bg-gray-50/60 px-3.5 py-2 flex items-center gap-2 flex-wrap">
              <span className="w-6 text-center text-gray-300">+</span>
              <input
                value={newCode} onChange={e => setNewCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addUnit(); }}
                placeholder="Código (ej: 04)"
                className="h-8 w-36 px-2.5 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="number" value={newM2} onChange={e => setNewM2(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addUnit(); }}
                placeholder="m²"
                className="h-8 w-24 px-2.5 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
              />
              <button
                type="button" onClick={addUnit} disabled={!newCode.trim()}
                className="h-8 px-3.5 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
              >
                Agregar {unitLabelLower}
              </button>
              <span className="text-[11px] text-gray-400 hidden sm:inline">Enter agrega y deja el foco listo para el siguiente</span>
              <span className="flex-1" />
              <span className="text-[11px] text-gray-500 whitespace-nowrap">{counts.all} {unitLabelLower}s · {totalM2.toLocaleString('es-AR')} m² en total</span>
            </div>
          </Card>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }}>
              {visible.map(u => {
                const isSel = sel === u.id;
                return (
                  <button
                    key={u.id} type="button" onClick={() => setSel(u.id)}
                    className={`text-left rounded-xl overflow-hidden bg-white transition-colors ${isSel ? 'border-2 border-brand-500 shadow-[0_0_0_3px_rgba(92,122,88,.12)]' : 'border border-gray-200 hover:border-gray-300'}`}
                  >
                    <div className={`relative h-28 ${u.interior_image_url ? 'bg-gray-100' : 'bg-gray-50'}`}>
                      {u.interior_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.interior_image_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono text-gray-400">sin foto</span>
                      )}
                      {showStatus && (
                        <span className={`absolute top-2 left-2 h-5 px-2 rounded-full text-[9.5px] font-medium border flex items-center ${STATUS_PILL_BG[u.status]}`}>{getStatusLabel(u.status)}</span>
                      )}
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{u.code}</p>
                        <p className="text-xs text-gray-500">{u.total_area ? `${u.total_area} m²` : '—'}</p>
                      </div>
                      <p className="text-[10.5px] text-gray-400 mt-0.5">
                        {(u.interior_image_url ? 1 : 0) + (u.gallery_images ?? []).length} foto{((u.interior_image_url ? 1 : 0) + (u.gallery_images ?? []).length) === 1 ? '' : 's'} · {u.polygon && u.polygon.length > 0 ? 'delimitado' : 'sin marcar'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Panel de edición ──────────────────────────────────── */}
      <div className="w-full xl:w-[400px] shrink-0 xl:h-full">
        <Card className="flex flex-col xl:h-full">
          <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold text-gray-900">{cur ? `${unitLabel} ${cur.code}` : `Ningún ${unitLabelLower} seleccionado`}</p>
              <p className="text-xs text-gray-500 mt-0.5">{cur ? `${curIdx + 1} de ${units.length} · ${getStatusLabel(cur.status).toLowerCase()}` : `Elegí un ${unitLabelLower} de la lista`}</p>
            </div>
            <p className="text-xs text-gray-400 shrink-0">{saving ? 'Guardando...' : savedLabel}</p>
          </div>

          {cur ? (
            <div className="flex-1 xl:min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <p className="text-[11.5px] font-medium text-gray-900">Foto principal</p>
                <ImageUploader value={cur.interior_image_url ?? ''} onChange={url => patch(cur.id, { interiorImageUrl: url || null })} folder="units" />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-[11.5px] font-medium text-gray-900">Más fotos</p>
                <MultiImageUploader values={cur.gallery_images ?? []} onChange={urls => patch(cur.id, { galleryImages: urls })} folder="units" />
              </div>

              {!unitIsLand && otherUnits.length > 0 && (
                <div className="flex flex-col gap-1.5 p-3 rounded-xl border border-gray-200 bg-gray-50">
                  <p className="text-[11px] text-gray-600 leading-relaxed">¿Este {unitLabelLower} ya existe en otro piso o edificio? Copiá sus datos en vez de retipearlos.</p>
                  <div className="flex gap-1.5">
                    <select
                      value={copySourceId}
                      onChange={e => setCopySourceId(e.target.value)}
                      className="flex-1 h-8 px-2 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">{`Elegir ${unitLabelLower} de referencia...`}</option>
                      {otherUnits.map(u => (
                        <option key={u.id} value={u.id}>
                          {u.code}{u.building_name ? ` · ${u.building_name}` : ''}{u.floor_number != null ? ` · Piso ${u.floor_number}` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button" onClick={handleCopyFromUnit} disabled={!copySourceId || copying}
                      className="h-8 px-3 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
                    >
                      {copying ? 'Copiando...' : 'Copiar datos'}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2.5">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Código</label>
                  <input
                    defaultValue={cur.code} key={`code-${cur.id}`}
                    onBlur={e => { if (e.target.value !== cur.code) patch(cur.id, { code: e.target.value }); }}
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Superficie (m²)</label>
                  <input
                    type="number" defaultValue={cur.total_area ?? ''} key={`m2-${cur.id}`}
                    onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== cur.total_area) patch(cur.id, { totalArea: v }); }}
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {!unitIsLand && (
                <>
                  <div className="flex gap-2.5">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Modelo</label>
                      <input
                        defaultValue={cur.model_name ?? ''} key={`model-${cur.id}`}
                        onBlur={e => { const v = e.target.value.trim() || null; if (v !== cur.model_name) patch(cur.id, { modelName: v }); }}
                        placeholder="SUITE GARDEN"
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Tipología</label>
                      <select
                        value={cur.type ?? UNIT_TYPES[0]}
                        onChange={e => patch(cur.id, { type: e.target.value })}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {UNIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-2.5 items-end">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Dormitorios</label>
                      <input
                        type="number" defaultValue={cur.bedrooms ?? ''} key={`bed-${cur.id}`}
                        onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== cur.bedrooms) patch(cur.id, { bedrooms: v }); }}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Baños</label>
                      <input
                        type="number" defaultValue={cur.bathrooms ?? ''} key={`bath-${cur.id}`}
                        onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== cur.bathrooms) patch(cur.id, { bathrooms: v }); }}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <label className="flex items-center gap-1.5 h-9 pb-1.5 text-[11px] text-gray-700 whitespace-nowrap shrink-0">
                      <input
                        type="checkbox" checked={!!cur.has_service_room}
                        onChange={e => patch(cur.id, { hasServiceRoom: e.target.checked })}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      Serv.
                    </label>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11.5px] font-medium text-gray-900">Orientación</label>
                    <input
                      defaultValue={cur.orientation ?? ''} key={`orient-${cur.id}`}
                      onBlur={e => { const v = e.target.value.trim() || null; if (v !== cur.orientation) patch(cur.id, { orientation: v }); }}
                      placeholder="NE"
                      className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>

                  <div className="flex gap-2.5">
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Interior (m²)</label>
                      <input
                        type="number" defaultValue={cur.inner_area ?? ''} key={`inner-${cur.id}`}
                        onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== cur.inner_area) patch(cur.id, { innerArea: v }); }}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Balcón (m²)</label>
                      <input
                        type="number" defaultValue={cur.balcony_area ?? 0} key={`balcony-${cur.id}`}
                        onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== cur.balcony_area) patch(cur.id, { balconyArea: v }); }}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1.5">
                      <label className="text-[11.5px] font-medium text-gray-900">Exterior (m²)</label>
                      <input
                        type="number" defaultValue={cur.external_area ?? 0} key={`external-${cur.id}`}
                        onBlur={e => { const v = e.target.value === '' ? 0 : Number(e.target.value); if (v !== cur.external_area) patch(cur.id, { externalArea: v }); }}
                        className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                      />
                    </div>
                  </div>
                </>
              )}

              {showPrice && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11.5px] font-medium text-gray-900">Precio</label>
                  <input
                    type="number" defaultValue={cur.price ?? ''} key={`price-${cur.id}`}
                    onBlur={e => { const v = e.target.value === '' ? null : Number(e.target.value); if (v !== cur.price) patch(cur.id, { price: v }); }}
                    placeholder={`Sin precio — se muestra "${'Consultar'}"`}
                    className="h-9 w-full px-2.5 rounded-lg border border-gray-300 text-xs outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  {cur.price != null && <p className="text-[10.5px] text-gray-400">{formatPrice(cur.price, cur.currency)}</p>}
                </div>
              )}

              {showStatus && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11.5px] font-medium text-gray-900">Estado</p>
                  <div className="flex gap-1.5">
                    {UNIT_STATUSES.map(s => (
                      <button
                        key={s} type="button" onClick={() => patch(cur.id, { status: s })}
                        className={`flex-1 h-9 rounded-lg text-[11px] font-medium border transition-colors ${cur.status === s ? STATUS_PILL_BG[s] : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                      >
                        {getStatusLabel(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {!unitIsLand && (
                <>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11.5px] font-medium text-gray-900">Plano 3D (planta)</p>
                    <ImageUploader value={cur.floor_plan_3d_url ?? ''} onChange={url => patch(cur.id, { floorPlan3dUrl: url || null })} folder="floorplans" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11.5px] font-medium text-gray-900">Render 3D</p>
                    <ImageUploader value={cur.plan_3d_url ?? ''} onChange={url => patch(cur.id, { plan3dUrl: url || null })} folder="floorplans" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-[11.5px] font-medium text-gray-900">Plano técnico</p>
                    <ImageUploader value={cur.technical_plan_url ?? ''} onChange={url => patch(cur.id, { technicalPlanUrl: url || null })} folder="floorplans" />
                  </div>
                  <div className="flex flex-col gap-1.5 pt-1">
                    <p className="text-[11.5px] font-medium text-gray-900">Recorrido 360°</p>
                    <TourEditor
                      key={cur.id}
                      initialTourData={cur.tour_data}
                      onPersist={next => patch(cur.id, { tourData: next })}
                    />
                  </div>
                  <Link
                    href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${cur.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/60 px-3.5 py-2.5 hover:border-gray-300 hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[11.5px] font-medium text-gray-900">Ambientes del {unitLabelLower}</span>
                    <span className="text-[11px] font-medium text-brand-600 shrink-0">Abrir →</span>
                  </Link>
                </>
              )}

              <div className={`flex flex-col gap-2 p-3.5 rounded-xl border ${cur.polygon && cur.polygon.length > 0 ? 'bg-brand-50 border-brand-100' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${cur.polygon && cur.polygon.length > 0 ? 'bg-brand-500' : 'bg-amber-400'}`} />
                  <p className="text-[11.5px] font-medium text-gray-900">{cur.polygon && cur.polygon.length > 0 ? 'Delimitado en el plano' : 'Falta marcarlo en el plano'}</p>
                </div>
                <p className="text-[11px] leading-relaxed text-gray-600">
                  {cur.polygon && cur.polygon.length > 0
                    ? `La silueta ya está dibujada, así que el ${unitLabelLower} es clickeable desde el masterplan.`
                    : `Sin silueta el ${unitLabelLower} aparece en la lista del sitio, pero no se puede tocar desde el masterplan.`}
                </p>
                <Link href={planoHref} className="self-start h-8 px-3 flex items-center bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 transition-colors">
                  {cur.polygon && cur.polygon.length > 0 ? 'Ver la silueta en el plano →' : 'Marcarlo en el plano →'}
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center px-5 py-10 text-center text-sm text-gray-400">
              No hay {unitLabelLower}s todavía — agregá uno desde la lista.
            </div>
          )}

          <div className="shrink-0 px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
            <button
              type="button" onClick={() => cur && removeUnits([cur.id])} disabled={!cur}
              className="h-9 px-3 border border-red-200 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors"
            >
              Borrar {unitLabelLower}
            </button>
            <div className="flex gap-1.5">
              <button
                type="button" onClick={() => curIdx > 0 && setSel(units[curIdx - 1].id)} disabled={curIdx <= 0}
                aria-label={`${unitLabel} anterior`}
                className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-lg text-gray-700 hover:border-gray-300 disabled:opacity-30 transition-colors"
              >
                ←
              </button>
              <button
                type="button" onClick={() => curIdx > -1 && curIdx < units.length - 1 && setSel(units[curIdx + 1].id)} disabled={curIdx === -1 || curIdx >= units.length - 1}
                className="h-9 px-3.5 bg-gray-900 text-white rounded-lg text-xs font-medium hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                Siguiente {unitLabelLower} →
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ value, label, color, active, onClick }: { value: number; label: string; color?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex-1 min-w-[110px] text-left bg-white rounded-xl px-3.5 py-3 border transition-colors ${active ? 'border-brand-500 shadow-[0_0_0_2px_rgba(92,122,88,.12)]' : 'border-gray-200 hover:border-gray-300'}`}
    >
      <p className="text-[19px] font-semibold leading-none" style={{ color: color ?? '#101828' }}>{value}</p>
      <p className="text-[10.5px] text-gray-500 mt-1 leading-tight">{label}</p>
    </button>
  );
}

function HeadCheck({ checked, onChange, stop }: { checked: boolean; onChange: () => void; stop?: boolean }) {
  return (
    <span
      className="w-8 shrink-0 flex items-center justify-center cursor-pointer"
      onClick={e => { if (stop) e.stopPropagation(); onChange(); }}
    >
      <span className={`w-4 h-4 rounded flex items-center justify-center text-[10px] font-bold text-white ${checked ? 'bg-brand-600 border border-brand-600' : 'bg-white border border-gray-300'}`}>
        {checked ? '✓' : ''}
      </span>
    </span>
  );
}
