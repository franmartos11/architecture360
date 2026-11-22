'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect, useMemo, useRef, startTransition, Fragment } from 'react';
import { PageSkeleton, Skeleton, SkeletonTable } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { downloadCsv } from '@/lib/csv';
import { pluralize } from '@/lib/units';
import { parsePastedNumber } from '@/lib/parse-pasted-number';
import type { UnitRow as DbUnitRow } from '@/types/database';
import type { UnitStatus, UnitType } from '@/types';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { unitAgreement, buildingAgreement } from '@/lib/project-types';
import { STATUS_STYLE, money } from '@/lib/panel-comercial-style';
import { PageHeader, btnSecondary, btnPrimary } from '@/components/admin/panel-ui';

// building_name/floor_number/building_id no son columnas reales de `units` —
// las agrega /api/admin/units enriqueciendo cada fila para el listado global.
type UnitRow = Pick<DbUnitRow, 'id' | 'code' | 'model_name' | 'type' | 'total_area' | 'status' | 'price' | 'currency' | 'floor_id'> & {
  orientation?: string | null;
  polygon?: { x: number; y: number }[] | null;
  building_id: string | null;
  building_name: string | null;
  floor_number: number | null;
};
type FloorRow = { id: string; building_id: string; number: number; label: string; floor_kind?: string };
type BuildingRow = { id: string; name: string };

// Columnas editables en la tabla, en el orden en que se ven (y en el que se
// reparte un bloque pegado desde Excel: la primera celda va a la columna
// enfocada, las siguientes a las de la derecha).
type EditCol = 'area' | 'orientation' | 'status' | 'price';
const ORIENTATIONS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'] as const;
const STATUS_LABEL: Record<UnitStatus, string> = { available: 'Disponible', reserved: 'Reservado', sold: 'Vendido' };

/** "Disponible", "res.", "sold"… → estado; null si no se entiende. */
function parseStatus(text: string): UnitStatus | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  if (/^(disp|libre|available|avail)/.test(t)) return 'available';
  if (/^(res|reserved|seña)/.test(t)) return 'reserved';
  if (/^(vend|sold|vtd)/.test(t)) return 'sold';
  return null;
}

/** "Norte", "NW", "noreste"… → N/NE/E/SE/S/SO/O/NO; null si no se entiende. */
function parseOrientation(text: string): string | null {
  const t = text.trim().toUpperCase().replace(/\s+/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t) return null;
  const words: Record<string, string> = {
    NORTE: 'N', SUR: 'S', ESTE: 'E', OESTE: 'O', NORESTE: 'NE', NOROESTE: 'NO', SUDESTE: 'SE', SURESTE: 'SE', SUDOESTE: 'SO', SUROESTE: 'SO',
    W: 'O', NW: 'NO', SW: 'SO',
  };
  const v = words[t] ?? t;
  return (ORIENTATIONS as readonly string[]).includes(v) ? v : null;
}

interface PendingChange { unit: UnitRow; col: EditCol; from: string; to: string; value: number | string }

export default function AdminInventory() {
  const contentIn = useContentIn();
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [buildingFilter, setBuildingFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<UnitStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<UnitType | 'all'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<UnitStatus>('available');
  const [bulkPriceMode, setBulkPriceMode] = useState<'pct' | 'fixed'>('pct');
  const [bulkPriceSign, setBulkPriceSign] = useState<'increase' | 'decrease'>('increase');
  const [bulkPriceAmount, setBulkPriceAmount] = useState('');
  const [bulkWorking, setBulkWorking] = useState(false);
  // Corte del edificio (siempre visible a la izquierda) y sus acciones.
  const [corteId, setCorteId] = useState<string | null>(null);
  const [addCount, setAddCount] = useState(1);
  const [dupSourceId, setDupSourceId] = useState('');
  const [structureBusy, setStructureBusy] = useState(false);
  const [newBuildingOpen, setNewBuildingOpen] = useState(false);
  const [newBuildingName, setNewBuildingName] = useState('');
  // Pegado desde Excel: vista previa antes de guardar.
  const [pending, setPending] = useState<{ changes: PendingChange[]; skipped: number } | null>(null);
  const [applyingPaste, setApplyingPaste] = useState(false);
  const tableRef = useRef<HTMLTableElement>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const activeProjectId = useActiveProjectId();
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const uAgree = unitAgreement(typeConfig);
  const bAgree = buildingAgreement(typeConfig);
  const currency = units[0]?.currency || 'USD';
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();

  const editCols: EditCol[] = [
    'area',
    ...(typeConfig.unitIsLand ? [] : ['orientation' as const]),
    ...(typeConfig.showStatus ? ['status' as const] : []),
    ...(typeConfig.showPrice ? ['price' as const] : []),
  ];
  const columnCount = 3 + editCols.length + (typeConfig.showPrice ? 1 : 0);

  const buildingNames = useMemo(
    () => Array.from(new Set(units.map(u => u.building_name).filter((n): n is string => !!n))).sort(),
    [units]
  );
  const typesPresent = useMemo(
    () => Array.from(new Set(units.map(u => u.type))).sort(),
    [units]
  );

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter(u => {
      const matchesSearch = !q || u.code.toLowerCase().includes(q) || (u.model_name ?? '').toLowerCase().includes(q);
      const matchesBuilding = buildingFilter === 'all' || u.building_name === buildingFilter;
      const matchesStatus = statusFilter === 'all' || u.status === statusFilter;
      const matchesType = typeFilter === 'all' || u.type === typeFilter;
      return matchesSearch && matchesBuilding && matchesStatus && matchesType;
    });
  }, [units, search, buildingFilter, statusFilter, typeFilter]);

  const fetchAll = () => {
    startTransition(() => {
      setLoading(true);
      setError(false);
    });
    const get = (url: string) => fetch(withActiveProject(url, activeProjectId)).then(res => {
      if (!res.ok) throw new Error('Request failed');
      return res.json();
    });
    Promise.all([
      get('/api/admin/units'),
      // Pisos y edificios: para el corte (incluye pisos sin unidades) y las
      // acciones de estructura. Si fallan, la tabla igual se muestra.
      get('/api/admin/floors').catch(() => []),
      get('/api/admin/buildings').catch(() => []),
    ])
      .then(([unitsData, floorsData, buildingsData]) => {
        setUnits(Array.isArray(unitsData) ? unitsData : []);
        setFloors(Array.isArray(floorsData) ? floorsData : []);
        setBuildings(Array.isArray(buildingsData) ? buildingsData.map((b: BuildingRow) => ({ id: b.id, name: b.name })) : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError(true);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  const handleUpdateUnit = async (id: string, updates: Partial<Pick<UnitRow, 'status' | 'price' | 'total_area' | 'orientation'>>) => {
    setSavingId(id);
    // La API de unidades usa camelCase.
    const body: Record<string, unknown> = {};
    if ('status' in updates) body.status = updates.status;
    if ('price' in updates) body.price = updates.price;
    if ('total_area' in updates) body.totalArea = updates.total_area;
    if ('orientation' in updates) body.orientation = updates.orientation;
    try {
      const res = await fetch(`/api/admin/units/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setUnits(prev => prev.map(u => u.id === id ? { ...u, ...updates } : u));
        toast('Guardado.');
      } else {
        toast(`Error al actualizar ${hasFloorStep ? 'la unidad' : `${uAgree.el} ${unitLabelLower}`}.`, 'error');
      }
    } catch (error) {
      console.error(error);
      toast('Error al actualizar la unidad.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allFilteredSelected = filteredUnits.length > 0 && filteredUnits.every(u => selectedIds.has(u.id));
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredUnits.forEach(u => next.delete(u.id));
      else filteredUnits.forEach(u => next.add(u.id));
      return next;
    });
  };

  const handleBulkStatus = async () => {
    setBulkWorking(true);
    const ids = Array.from(selectedIds);
    // Un solo request para todo el lote — antes era un fetch por unidad en
    // paralelo, y con más de 120 seleccionadas el límite de escrituras del
    // admin (proxy.ts) cortaba el resto en silencio.
    const res = await fetch(withActiveProject('/api/admin/units/bulk', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, status: bulkStatus }),
    });
    setBulkWorking(false);
    if (!res.ok) { toast('No se pudo actualizar el estado.', 'error'); return; }
    const { updated, skipped } = await res.json() as { updated: string[]; skipped: { id: string; reason: string }[] };
    setUnits(prev => prev.map(u => (updated.includes(u.id) ? { ...u, status: bulkStatus } : u)));
    toast(
      `Estado actualizado en ${updated.length} ${updated.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}.${skipped.length > 0 ? ` ${skipped.length} sin poder actualizar.` : ''}`,
      skipped.length > 0 ? 'error' : undefined
    );
  };

  const handleBulkPrice = async () => {
    const amount = Number(bulkPriceAmount);
    if (!bulkPriceAmount || Number.isNaN(amount) || amount <= 0) { toast('Ingresá un monto válido.', 'error'); return; }
    setBulkWorking(true);
    // El delta lo calcula el servidor con el precio que hay en la base ahora.
    const res = await fetch(withActiveProject('/api/admin/units/bulk', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: Array.from(selectedIds),
        priceAdjustment: { mode: bulkPriceMode, sign: bulkPriceSign, amount },
      }),
    });
    setBulkWorking(false);
    if (!res.ok) { toast('No se pudo ajustar el precio.', 'error'); return; }
    const { updated, skipped } = await res.json() as { updated: { id: string; price: number }[]; skipped: { id: string; reason: string }[] };
    const priceById = new Map(updated.map(u => [u.id, u.price]));
    setUnits(prev => prev.map(u => (priceById.has(u.id) ? { ...u, price: priceById.get(u.id)! } : u)));
    const skippedNoPrice = skipped.filter(s => s.reason === 'Sin precio cargado').length;
    toast(`Precio actualizado en ${updated.length} ${updated.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}.${skippedNoPrice > 0 ? ` ${skippedNoPrice} sin precio cargado, omitida${skippedNoPrice === 1 ? '' : 's'}.` : ''}`);
  };

  const handleExportCsv = () => {
    const header = ['code', 'modelName', 'type', 'totalArea', 'orientation', 'buildingName', 'floorNumber', 'status', 'price', 'currency'];
    const rows = filteredUnits.map(u => [
      u.code, u.model_name ?? '', u.type, String(u.total_area ?? ''), u.orientation ?? '',
      u.building_name ?? '', String(u.floor_number ?? ''), u.status, u.price != null ? String(u.price) : '', u.currency || 'USD',
    ]);
    downloadCsv(`${hasFloorStep ? 'unidades' : `${pluralize(unitLabelLower)}`}.csv`, [header, ...rows]);
  };

  // ── Celdas editables: Enter baja a la misma columna de la fila siguiente
  //    (Tab ya avanza a la celda de la derecha por orden del DOM).
  const focusCell = (row: number, col: number) => {
    const el = tableRef.current?.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  };
  const cellKeyDown = (row: number, col: number) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); focusCell(row + 1, col); }
    if (e.key === 'Escape' && e.target instanceof HTMLInputElement) {
      e.target.value = e.target.defaultValue;
      e.target.blur();
    }
  };

  const commitNumber = (unit: UnitRow, field: 'total_area' | 'price', input: HTMLInputElement) => {
    const stored = unit[field] ?? null;
    const raw = input.value.trim();
    if (raw === '') {
      // Precio vacío = "Consultar"; superficie vacía = sin dato.
      if (stored !== null) handleUpdateUnit(unit.id, { [field]: null });
      return;
    }
    const parsed = parsePastedNumber(raw);
    const n = parsed == null ? NaN : Number(parsed);
    if (!Number.isFinite(n) || n < 0) {
      input.value = stored == null ? '' : String(stored);
      toast('Ese valor no es un número.', 'error');
      return;
    }
    if (n !== stored) handleUpdateUnit(unit.id, { [field]: n });
  };

  // ── Pegar un bloque desde Excel: arranca en la celda enfocada y reparte
  //    filas hacia abajo y columnas hacia la derecha. Nada se guarda hasta
  //    confirmar la vista previa.
  const handleTablePaste = (e: React.ClipboardEvent<HTMLTableElement>) => {
    const target = e.target as HTMLElement;
    const row = Number(target.dataset.row);
    const col = Number(target.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) return;
    const text = e.clipboardData.getData('text');
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ''))) return; // un solo valor: pegado normal
    e.preventDefault();
    const grid = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(line => line.split('\t'));
    const changes: PendingChange[] = [];
    let skipped = 0;
    grid.forEach((cells, r) => {
      const unit = filteredUnits[row + r];
      if (!unit) { skipped += cells.length; return; }
      cells.forEach((cell, c) => {
        const colName = editCols[col + c];
        if (!colName || cell.trim() === '') { if (cell.trim() !== '') skipped += 1; return; }
        if (colName === 'status') {
          const v = parseStatus(cell);
          if (!v) { skipped += 1; return; }
          if (v !== unit.status) changes.push({ unit, col: colName, from: STATUS_LABEL[unit.status], to: STATUS_LABEL[v], value: v });
        } else if (colName === 'orientation') {
          const v = parseOrientation(cell);
          if (!v) { skipped += 1; return; }
          if (v !== (unit.orientation ?? '')) changes.push({ unit, col: colName, from: unit.orientation || '—', to: v, value: v });
        } else {
          const parsed = parsePastedNumber(cell);
          const n = parsed == null ? NaN : Number(parsed);
          if (!Number.isFinite(n) || n < 0) { skipped += 1; return; }
          const stored = colName === 'area' ? unit.total_area : unit.price;
          if (n !== stored) {
            const fmt = (v: number | null) => (v == null ? '—' : colName === 'price' ? `${unit.currency || 'USD'} ${v.toLocaleString('es-AR')}` : `${v} m²`);
            changes.push({ unit, col: colName, from: fmt(stored), to: fmt(n), value: n });
          }
        }
      });
    });
    if (changes.length === 0) {
      toast(skipped ? `No hay cambios para aplicar (${skipped} celda${skipped === 1 ? '' : 's'} sin entender).` : 'No hay cambios: los valores ya son esos.');
      return;
    }
    setPending({ changes, skipped });
  };

  const applyPaste = async () => {
    if (!pending) return;
    setApplyingPaste(true);
    const byUnit = new Map<string, Record<string, unknown>>();
    for (const ch of pending.changes) {
      const patch = byUnit.get(ch.unit.id) ?? { id: ch.unit.id };
      const key = ch.col === 'area' ? 'totalArea' : ch.col;
      patch[key] = ch.value;
      byUnit.set(ch.unit.id, patch);
    }
    const res = await fetch(withActiveProject('/api/admin/guided', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: [...byUnit.values()] }),
    }).catch(() => null);
    setApplyingPaste(false);
    // El PATCH en lote guarda unidad por unidad: si falla alguna, el server
    // responde error con `failed` pero las demás YA quedaron guardadas — la
    // tabla tiene que reflejarlas igual, y avisar solo por las que fallaron.
    let failedIds = new Set<string>();
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      const failed: { id: string }[] = Array.isArray(data?.failed) ? data.failed : [];
      if (failed.length === 0) {
        toast(data?.error ?? 'No se pudieron guardar los cambios pegados.', 'error');
        return;
      }
      failedIds = new Set(failed.map(f => f.id));
    }
    const saved = pending.changes.filter(ch => !failedIds.has(ch.unit.id));
    setUnits(prev => prev.map(u => {
      const mine = saved.filter(ch => ch.unit.id === u.id);
      if (mine.length === 0) return u;
      const next = { ...u };
      for (const ch of mine) {
        if (ch.col === 'area') next.total_area = ch.value as number;
        if (ch.col === 'price') next.price = ch.value as number;
        if (ch.col === 'status') next.status = ch.value as UnitStatus;
        if (ch.col === 'orientation') next.orientation = ch.value as string;
      }
      return next;
    }));
    if (failedIds.size > 0) {
      toast(`${saved.length} cambio${saved.length === 1 ? '' : 's'} guardado${saved.length === 1 ? '' : 's'}; ${failedIds.size} unidad${failedIds.size === 1 ? '' : 'es'} no se pudo guardar (código repetido u otro error).`, 'error');
    } else {
      toast(`${saved.length} cambio${saved.length === 1 ? '' : 's'} guardado${saved.length === 1 ? '' : 's'}.`);
    }
    setPending(null);
  };

  // ── Estructura: agregar pisos, duplicar un piso, nuevo edificio.
  const corteBuildingId = corteId
    ?? buildings.find(b => b.name === buildingFilter)?.id
    ?? buildings[0]?.id
    ?? null;
  const corteBuilding = buildings.find(b => b.id === corteBuildingId) ?? null;
  const corteFloorRows = floors.filter(f => f.building_id === corteBuildingId).sort((a, b) => b.number - a.number);
  const nextFloorNumber = corteFloorRows.length ? Math.max(...corteFloorRows.map(f => f.number)) + 1 : 1;

  const handleAddFloors = async () => {
    if (!corteBuildingId || addCount < 1) return;
    setStructureBusy(true);
    let ok = 0;
    for (let i = 0; i < addCount; i++) {
      const n = nextFloorNumber + i;
      const res = await fetch('/api/admin/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: corteBuildingId, number: n, label: `Piso ${n}` }),
      }).catch(() => null);
      if (res?.ok) ok += 1;
    }
    setStructureBusy(false);
    toast(ok === addCount ? `${ok} piso${ok === 1 ? '' : 's'} agregado${ok === 1 ? '' : 's'}.` : `Se agregaron ${ok} de ${addCount} pisos.`, ok === addCount ? undefined : 'error');
    fetchAll();
  };

  const handleDuplicateFloor = async () => {
    const source = floors.find(f => f.id === dupSourceId);
    if (!source) return;
    const ok = await confirm({
      title: `Duplicar ${source.label}`,
      message: `Se crea el Piso ${nextFloorNumber} arriba de todo, con las mismas ${pluralize(unitLabelLower)}, formas y datos que ${source.label}.`,
      confirmLabel: 'Duplicar',
    });
    if (!ok) return;
    setStructureBusy(true);
    const res = await fetch(`/api/admin/floors/${source.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: nextFloorNumber, label: `Piso ${nextFloorNumber}`, includeUnits: true }),
    }).catch(() => null);
    setStructureBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      toast(data?.error ?? 'No se pudo duplicar el piso.', 'error');
      return;
    }
    toast(`${source.label} duplicado como Piso ${nextFloorNumber}.`);
    setDupSourceId('');
    fetchAll();
  };

  const handleCreateBuilding = async () => {
    const name = newBuildingName.trim();
    if (!name) return;
    setStructureBusy(true);
    const res = await fetch(withActiveProject('/api/admin/buildings', activeProjectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, totalFloors: 1 }),
    }).catch(() => null);
    setStructureBusy(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => ({}));
      toast(data?.error ?? `No se pudo crear ${bAgree.el} ${buildingLabelLower}.`, 'error');
      return;
    }
    const created = await res.json();
    toast(`${buildingLabel} creado.`);
    setNewBuildingName('');
    setNewBuildingOpen(false);
    setCorteId(created.id ?? null);
    fetchAll();
  };

  if (loading) return (
    <PageSkeleton actions={3}>
      <Skeleton className="h-11 w-full max-w-[420px] rounded-[10px]" />
      <SkeletonTable rows={8} cols={7} />
    </PageSkeleton>
  );
  if (error) return <ErrorState message={`No se pudo cargar ${hasFloorStep ? 'el inventario' : `${uAgree.el === 'la' ? 'las' : 'los'} ${pluralize(unitLabelLower)}`}.`} onRetry={fetchAll} />;

  const counts = {
    available: units.filter(u => u.status === 'available').length,
    reserved: units.filter(u => u.status === 'reserved').length,
    sold: units.filter(u => u.status === 'sold').length,
  };
  const floorsCount = floors.length || new Set(units.map(u => `${u.building_name}|${u.floor_number}`)).size;
  const title = hasFloorStep ? 'Unidades' : `${pluralize(unitLabel)}`;

  // "Incompleta": le falta algo que el sitio necesita — superficie, forma en
  // el plano y (si se vende) precio.
  const missingOf = (u: UnitRow) => [
    !u.total_area ? 'superficie' : null,
    !(u.polygon && u.polygon.length >= 3) ? 'forma en el plano' : null,
    typeConfig.showPrice && u.price == null ? 'precio' : null,
  ].filter((m): m is string => !!m);
  const incompleteCount = units.filter(u => missingOf(u).length > 0).length;

  // Tipologías = model_name (lo que arma la carga guiada: "Tipología A").
  const typologies = Array.from(
    units.reduce((m, u) => {
      if (!u.model_name) return m;
      const t = m.get(u.model_name) ?? { name: u.model_name, type: u.type, area: u.total_area, count: 0 };
      t.count += 1;
      m.set(u.model_name, t);
      return m;
    }, new Map<string, { name: string; type: string; area: number | null; count: number }>()).values()
  ).sort((a, b) => a.name.localeCompare(b.name, 'es'));

  const unitsByFloor = new Map<string, UnitRow[]>();
  for (const u of units) {
    if (!u.floor_id) continue;
    unitsByFloor.set(u.floor_id, [...(unitsByFloor.get(u.floor_id) ?? []), u]);
  }
  const showCorte = hasFloorStep && buildings.length > 0;
  const canAddBuilding = hasUnitStep && !typeConfig.singleBuilding;

  const statusPill: Record<UnitStatus, string> = {
    available: 'bg-brand-50 text-brand-800 border-brand-200',
    reserved: 'bg-amber-100 text-amber-800 border-amber-200',
    sold: 'bg-gray-900 text-white border-gray-900',
  };
  const th = 'px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500 whitespace-nowrap';
  const darkBtn = 'min-h-[36px] px-3 rounded-lg border border-[#3A3B38] text-[13px] font-semibold text-white hover:border-gray-500';
  const cellInput = 'w-full min-w-0 h-[34px] px-2 rounded-lg border border-transparent bg-transparent text-[13px] font-medium text-gray-900 outline-none hover:border-gray-300 focus:border-brand-700 focus:bg-white placeholder:text-gray-400 disabled:opacity-50 max-sm:h-11 max-sm:border-gray-300 max-sm:bg-white';
  const colIndex = (c: EditCol) => editCols.indexOf(c);

  return (
    <m.div {...contentIn} className="flex flex-col gap-6">
      <PageHeader
        eyebrow={hasFloorStep ? 'Estructura e inventario' : 'Inventario'}
        title={title}
        description={
          <>
            {buildingNames.length > 1 && `${buildingNames.length} ${pluralize(buildingLabelLower)} · `}
            {hasFloorStep && floorsCount > 0 && `${floorsCount} pisos · `}
            {units.length} {units.length === 1 ? unitLabelLower : pluralize(unitLabelLower)}
            {typeConfig.showStatus && units.length > 0 && <> — <b className="font-semibold text-gray-900">{counts.available} disponibles</b>, {counts.reserved} reservadas, {counts.sold} vendidas</>}
            {incompleteCount > 0 && <> · <span className="text-amber-800">{incompleteCount} incompleta{incompleteCount === 1 ? '' : 's'}</span></>}
          </>
        }
        actions={
          <>
            {canAddBuilding && (
              <button type="button" onClick={() => setNewBuildingOpen(o => !o)} aria-expanded={newBuildingOpen} className={btnSecondary}>
                + {buildingLabel}
              </button>
            )}
            <button type="button" onClick={handleExportCsv} disabled={filteredUnits.length === 0} className={btnSecondary}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 4v12M7 11l5 5 5-5M4 20h16" /></svg>
              Exportar CSV
            </button>
          </>
        }
      />

      {newBuildingOpen && canAddBuilding && (
        <form onSubmit={e => { e.preventDefault(); handleCreateBuilding(); }}
          className="-mt-2 flex items-center gap-2 flex-wrap p-3 rounded-2xl border border-gray-200 bg-white">
          <label className="flex-1 min-w-[200px] flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700">Nombre {bAgree.del} {buildingLabelLower} {bAgree.nuevo}</span>
            <input autoFocus value={newBuildingName} onChange={e => setNewBuildingName(e.target.value)} placeholder={hasFloorStep ? 'Ej: Torre Sur' : `Ej: ${buildingLabel} 4`}
              className="min-h-[44px] px-3 rounded-[10px] border border-gray-300 bg-white text-sm outline-none focus:border-brand-700" />
          </label>
          <button type="submit" disabled={!newBuildingName.trim() || structureBusy} className={`${btnPrimary} self-end`}>Crear</button>
          <button type="button" onClick={() => setNewBuildingOpen(false)} className={`${btnSecondary} self-end`}>Cancelar</button>
          <p className="basis-full m-0 text-xs text-gray-600">Después cargás sus pisos y {pluralize(unitLabelLower)} desde el corte o desde {pluralize(buildingLabel)}.</p>
        </form>
      )}

      <p className="m-0 -mt-3 text-[13px] text-gray-600 max-w-[760px]">
        Editá en la celda: <b className="font-semibold text-gray-900">Tab</b> avanza, <b className="font-semibold text-gray-900">Enter</b> baja · pegá columnas desde Excel arrancando en cualquier celda.
        {!hasFloorStep && hasUnitStep && ` Para cargar ${pluralize(unitLabelLower)} ${uAgree.nuevo}s, entrá por ${pluralize(buildingLabel)} → la delimitación.`}
      </p>

      {typologies.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Tipologías <span className="font-normal text-gray-600">— tocá una para filtrar la tabla</span></h2>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(188px, 100%), 1fr))' }}>
            {typologies.map(t => {
              const on = typeFilter === 'all' && search === t.name;
              const letter = t.name.replace(/^Tipolog[ií]a\s*/i, '').charAt(0).toUpperCase() || '·';
              return (
                <button key={t.name} type="button" aria-pressed={on}
                  onClick={() => { setSearch(on ? '' : t.name); setTypeFilter('all'); }}
                  className={`text-left flex flex-col gap-2 p-3.5 rounded-[14px] bg-white transition-colors ${on ? 'border-[1.5px] border-gray-900' : 'border border-gray-200 hover:border-gray-300'}`}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="w-8 h-8 rounded-lg bg-gray-900 text-white text-sm font-semibold flex items-center justify-center">{letter}</span>
                    <span className="text-xs text-gray-600">{t.count} {t.count === 1 ? unitLabelLower : pluralize(unitLabelLower)}</span>
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-semibold text-gray-900 truncate">{t.type || t.name}</span>
                    {t.area ? <span className="font-display text-[22px] leading-tight font-semibold text-gray-900">{t.area} m²</span> : <span className="text-xs text-gray-500">Sin superficie</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex gap-5 flex-wrap items-start">
        {showCorte && (
          <aside aria-label="Corte del edificio" className="flex-[1_1_240px] md:max-w-[264px] min-w-0 flex flex-col gap-3 md:sticky md:top-6">
            <section className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600">Corte</span>
                {buildings.length === 1 && <span className="text-xs text-gray-600 truncate">{corteBuilding?.name}</span>}
              </div>
              {buildings.length > 1 && (
                <div role="radiogroup" aria-label={buildingLabel} className="flex gap-1 flex-wrap p-[3px] rounded-[10px] bg-[#EAE7E0]">
                  {buildings.map(b => (
                    <button key={b.id} type="button" role="radio" aria-checked={b.id === corteBuildingId}
                      onClick={() => { setCorteId(b.id); setBuildingFilter(b.name); }}
                      className={`flex-1 min-h-[32px] px-2 rounded-lg text-xs truncate ${b.id === corteBuildingId ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
              {corteFloorRows.length === 0 ? (
                <p className="m-0 text-xs text-gray-600">Sin pisos todavía. Agregalos abajo.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {corteFloorRows.map(f => {
                    const list = (unitsByFloor.get(f.id) ?? []).sort((a, b) => a.code.localeCompare(b.code, 'es', { numeric: true }));
                    return (
                      <div key={f.id} className="flex items-center gap-1.5">
                        <span className="w-7 text-right text-[11px] text-gray-500 shrink-0">{f.number === 0 ? 'PB' : /penthouse|^ph\b/i.test(f.label) ? 'PH' : f.number}</span>
                        <div className="flex-1 flex gap-1 min-w-0">
                          {list.length === 0 ? (
                            <span className="flex-1 h-5 rounded-[4px] border border-dashed border-gray-300 text-[9px] text-gray-500 flex items-center justify-center truncate px-1">
                              {f.floor_kind && f.floor_kind !== 'units' ? f.label : 'vacío'}
                            </span>
                          ) : list.map(u => {
                            const missing = missingOf(u);
                            const incomplete = missing.length > 0;
                            return (
                              <button key={u.id} type="button"
                                title={`${u.code} · ${STATUS_STYLE[u.status].label}${incomplete ? ` · falta ${missing.join(', ')}` : ''}`}
                                aria-label={`${u.code}: ${STATUS_STYLE[u.status].label}${incomplete ? `, incompleta (falta ${missing.join(', ')})` : ''}`}
                                onClick={() => setSearch(u.code)}
                                className={`flex-1 h-5 rounded-[4px] min-w-[10px] ${incomplete ? 'outline outline-[1.5px] outline-dashed outline-amber-800 -outline-offset-[1.5px]' : ''}`}
                                style={{ background: incomplete ? INCOMPLETE_BG : CORTE_COLOR[u.status] }} />
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="h-1.5 rounded-sm bg-[#2B302D] ml-[34px]" aria-hidden="true" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-gray-700">
                {(['available', 'reserved', 'sold'] as UnitStatus[]).filter(st => typeConfig.showStatus || st === 'available').map(st => (
                  <span key={st} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: CORTE_COLOR[st] }} />{typeConfig.showStatus ? STATUS_STYLE[st].label : 'Completa'}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] outline outline-1 outline-dashed outline-amber-800" style={{ background: INCOMPLETE_BG }} />Incompleta</span>
              </div>
            </section>

            <section className="rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3">
              <span className="text-[13px] font-semibold text-gray-900">Pisos {corteBuilding ? `· ${corteBuilding.name}` : ''}</span>
              <div className="flex items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-gray-700">Agregar</span>
                  <input type="number" min={1} max={50} value={addCount} onChange={e => setAddCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                    aria-label="Cantidad de pisos a agregar" className="w-16 min-h-[40px] px-2 rounded-[10px] border border-gray-300 text-sm text-center outline-none focus:border-brand-700" />
                </label>
                <button type="button" onClick={handleAddFloors} disabled={structureBusy || !corteBuildingId}
                  className="flex-1 min-h-[40px] px-3 rounded-[10px] border border-gray-300 bg-white text-[13px] font-medium text-gray-900 hover:border-gray-400 disabled:opacity-50">
                  Agregar pisos
                </button>
              </div>
              <p className="m-0 -mt-1 text-[11px] text-gray-600">Se crean vacíos desde el Piso {nextFloorNumber}.</p>
              <div className="flex items-end gap-2">
                <label className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-xs text-gray-700">Duplicar piso</span>
                  <select value={dupSourceId} onChange={e => setDupSourceId(e.target.value)} aria-label="Piso a duplicar"
                    className="min-h-[40px] px-2 rounded-[10px] border border-gray-300 bg-white text-[13px] text-gray-900 outline-none focus:border-brand-700">
                    <option value="">Elegí un piso…</option>
                    {corteFloorRows.filter(f => (unitsByFloor.get(f.id)?.length ?? 0) > 0).map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <button type="button" onClick={handleDuplicateFloor} disabled={structureBusy || !dupSourceId}
                  className="min-h-[40px] px-3 rounded-[10px] bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-40">
                  Duplicar
                </button>
              </div>
            </section>
          </aside>
        )}

        <div className="flex-[999_1_520px] min-w-0 flex flex-col gap-4">
          <div className="flex items-end gap-x-4 gap-y-3 flex-wrap border-b border-gray-200">
            {buildingNames.length > 1 && (
              <div role="tablist" aria-label={pluralize(buildingLabel)} className="flex gap-1 overflow-x-auto -mb-px">
                {[{ value: 'all', label: hasFloorStep ? 'Todos' : 'Todas', count: units.length }, ...buildingNames.map(n => ({ value: n, label: n, count: units.filter(u => u.building_name === n).length }))].map(tab => (
                  <button key={tab.value} type="button" role="tab" aria-selected={buildingFilter === tab.value}
                    onClick={() => { setBuildingFilter(tab.value); const b = buildings.find(x => x.name === tab.value); if (b) setCorteId(b.id); }}
                    className={`min-h-[44px] px-3.5 text-sm whitespace-nowrap border-b-2 ${buildingFilter === tab.value ? 'border-gray-900 font-semibold text-gray-900' : 'border-transparent text-gray-600 hover:text-gray-900'}`}>
                    {tab.label} <span className="text-gray-500 font-normal">{tab.count}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="flex-1" />
            <div className="flex items-center gap-2 flex-wrap pb-2.5 w-full sm:w-auto">
              <label className="flex-1 sm:flex-none flex items-center gap-2 min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white sm:w-[220px] focus-within:border-brand-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6A65" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Código o tipología" aria-label="Buscar por código o tipología"
                  className="flex-1 min-w-0 bg-transparent text-[13px] text-gray-900 outline-none placeholder:text-gray-500" />
              </label>
              {typeConfig.showStatus && (
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as UnitStatus | 'all')} aria-label="Filtrar por estado"
                  className="min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-900">
                  <option value="all">Cualquier estado</option>
                  <option value="available">Disponible</option>
                  <option value="reserved">Reservado</option>
                  <option value="sold">Vendido</option>
                </select>
              )}
              {typesPresent.length > 1 && (
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as UnitType | 'all')} aria-label="Filtrar por tipo"
                  className="min-h-[40px] px-3 rounded-[10px] border border-gray-200 bg-white text-[13px] text-gray-900">
                  <option value="all">Cualquier tipo</option>
                  {typesPresent.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
          </div>

          <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
            {selectedIds.size > 0 && (
              <div className="bg-gray-900 px-4 py-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white whitespace-nowrap mr-1">{selectedIds.size} seleccionada{selectedIds.size === 1 ? '' : 's'}</span>
                {typeConfig.showStatus && (
                  <span className="flex items-center gap-1.5">
                    <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value as UnitStatus)} aria-label="Estado a aplicar"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="available">Disponible</option>
                      <option value="reserved">Reservado</option>
                      <option value="sold">Vendido</option>
                    </select>
                    <button type="button" disabled={bulkWorking} onClick={handleBulkStatus} className={`${darkBtn} disabled:opacity-50`}>Cambiar estado</button>
                  </span>
                )}
                {typeConfig.showPrice && (
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <select value={bulkPriceSign} onChange={e => setBulkPriceSign(e.target.value as 'increase' | 'decrease')} aria-label="Subir o bajar"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="increase">Subir</option>
                      <option value="decrease">Bajar</option>
                    </select>
                    <input type="number" min={0} value={bulkPriceAmount} onChange={e => setBulkPriceAmount(e.target.value)} placeholder="Monto" aria-label="Monto del ajuste"
                      className="w-[84px] min-h-[36px] px-2.5 rounded-lg bg-white/10 text-[13px] text-white outline-none placeholder:text-white/50" />
                    <select value={bulkPriceMode} onChange={e => setBulkPriceMode(e.target.value as 'pct' | 'fixed')} aria-label="Porcentaje o monto fijo"
                      className="min-h-[36px] px-2.5 rounded-lg bg-transparent border border-[#3A3B38] text-[13px] text-white [&>option]:text-gray-900">
                      <option value="pct">%</option>
                      <option value="fixed">Monto fijo</option>
                    </select>
                    <button type="button" disabled={bulkWorking} onClick={handleBulkPrice} className={`${darkBtn} disabled:opacity-50`}>Ajustar precio</button>
                  </span>
                )}
                <button type="button" onClick={() => setSelectedIds(new Set())} aria-label="Deseleccionar todo"
                  className="ml-auto w-9 h-9 rounded-lg text-white/70 hover:text-white flex items-center justify-center">✕</button>
              </div>
            )}

            {/* Tabla en desktop; en celular cada unidad es una tarjeta con sus campos apilados. */}
            <div className="sm:overflow-x-auto">
              <table ref={tableRef} onPaste={handleTablePaste} className="w-full text-left border-collapse sm:min-w-[720px] max-sm:block">
                <thead className="max-sm:hidden">
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 w-[44px]">
                      <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-[#37463F]" aria-label="Seleccionar todas" />
                    </th>
                    <th className={th}>{hasFloorStep ? 'Unidad' : unitLabel}</th>
                    <th className={th}>Tipología</th>
                    <th className={`${th} w-[84px]`}>m² total</th>
                    {editCols.includes('orientation') && <th className={`${th} w-[88px]`}>Orient.</th>}
                    {typeConfig.showStatus && <th className={`${th} w-[136px]`}>Estado</th>}
                    {typeConfig.showPrice && <th className={`${th} w-[120px]`}>Precio {currency}</th>}
                    {typeConfig.showPrice && <th className={`${th} w-[84px] text-right`}>{currency}/m²</th>}
                  </tr>
                </thead>
                <tbody className="max-sm:block">
                  {filteredUnits.map((unit, row) => {
                    const missing = missingOf(unit);
                    return (
                      <tr key={unit.id} className={`border-b border-gray-100 max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2 max-sm:p-3 max-sm:relative ${selectedIds.has(unit.id) ? 'bg-brand-50' : 'bg-white'}`}>
                        <td className="px-4 py-2 max-sm:absolute max-sm:right-2 max-sm:top-2 max-sm:p-2">
                          <input type="checkbox" checked={selectedIds.has(unit.id)} onChange={() => toggleSelected(unit.id)} className="w-4 h-4 accent-[#37463F]" aria-label={`Seleccionar ${unit.code}`} />
                        </td>
                        <td className="px-3 py-2 max-sm:p-0 max-sm:col-span-2 max-sm:pr-10">
                          <div className="text-sm font-semibold text-gray-900 whitespace-nowrap">{unit.code}</div>
                          <div className="text-[11px] text-gray-600 whitespace-nowrap">
                            {unit.building_name ?? '—'}{hasFloorStep && <> · {unit.floor_number === 0 ? 'PB' : `Piso ${unit.floor_number ?? '—'}`}</>}
                          </div>
                          {missing.length > 0 && <div className="text-[11px] text-amber-800 whitespace-nowrap">Falta {missing.join(', ')}</div>}
                        </td>
                        <td className="px-3 py-2 max-sm:p-0 max-sm:col-span-2 text-[13px] text-gray-700 whitespace-nowrap max-sm:-mt-1">{unit.model_name ?? <span className="text-gray-400 max-sm:hidden">—</span>}</td>
                        <td className="px-2 py-2 max-sm:p-0">
                          <span className="sm:hidden block text-[11px] text-gray-500 mb-0.5">m² total</span>
                          <input
                            key={`a-${unit.id}-${unit.total_area}`}
                            type="text" inputMode="decimal"
                            defaultValue={unit.total_area ?? ''}
                            placeholder="—"
                            disabled={savingId === unit.id}
                            aria-label={`Superficie total de ${unit.code}`}
                            data-row={row} data-col={colIndex('area')}
                            onKeyDown={cellKeyDown(row, colIndex('area'))}
                            onBlur={e => commitNumber(unit, 'total_area', e.target)}
                            className={cellInput}
                          />
                        </td>
                        {editCols.includes('orientation') && (
                          <td className="px-2 py-2 max-sm:p-0">
                            <span className="sm:hidden block text-[11px] text-gray-500 mb-0.5">Orientación</span>
                            <select
                              value={unit.orientation ?? ''}
                              disabled={savingId === unit.id}
                              aria-label={`Orientación de ${unit.code}`}
                              data-row={row} data-col={colIndex('orientation')}
                              onKeyDown={cellKeyDown(row, colIndex('orientation'))}
                              onChange={e => handleUpdateUnit(unit.id, { orientation: e.target.value || null })}
                              className="w-full min-h-[34px] max-sm:min-h-[44px] max-sm:border-gray-300 max-sm:bg-white px-1.5 rounded-lg border border-transparent bg-transparent text-[13px] text-gray-900 hover:border-gray-300 focus:border-brand-700 focus:bg-white outline-none cursor-pointer disabled:opacity-50"
                            >
                              <option value="">—</option>
                              {ORIENTATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                        )}
                        {typeConfig.showStatus && (
                          <td className="px-2 py-2 max-sm:p-0">
                            <span className="sm:hidden block text-[11px] text-gray-500 mb-0.5">Estado</span>
                            <select
                              value={unit.status}
                              disabled={savingId === unit.id}
                              aria-label={`Estado de ${unit.code}`}
                              data-row={row} data-col={colIndex('status')}
                              onKeyDown={cellKeyDown(row, colIndex('status'))}
                              onChange={(e) => handleUpdateUnit(unit.id, { status: e.target.value as UnitStatus })}
                              className={`w-full min-w-[112px] min-h-[34px] pl-3 pr-1.5 rounded-full border text-xs font-semibold outline-none cursor-pointer disabled:opacity-50 focus:ring-2 focus:ring-brand-500/30 ${statusPill[unit.status]}`}
                            >
                              <option value="available">Disponible</option>
                              <option value="reserved">Reservado</option>
                              <option value="sold">Vendido</option>
                            </select>
                          </td>
                        )}
                        {typeConfig.showPrice && (
                          <td className="px-2 py-2 max-sm:p-0">
                            <span className="sm:hidden block text-[11px] text-gray-500 mb-0.5">Precio {currency}</span>
                            <input
                              key={`p-${unit.id}-${unit.price}`}
                              type="text" inputMode="numeric"
                              defaultValue={unit.price ?? ''}
                              placeholder="Consultar"
                              disabled={savingId === unit.id}
                              aria-label={`Precio de ${unit.code}`}
                              data-row={row} data-col={colIndex('price')}
                              onKeyDown={cellKeyDown(row, colIndex('price'))}
                              onBlur={e => commitNumber(unit, 'price', e.target)}
                              className={cellInput}
                            />
                          </td>
                        )}
                        {typeConfig.showPrice && (
                          <td className={`px-3 py-2 max-sm:p-0 max-sm:self-end max-sm:pb-2 text-xs text-right max-sm:text-left ${unit.price && unit.total_area ? 'text-gray-600' : 'text-amber-800'}`}>
                            {unit.price && unit.total_area ? <>{money(unit.price / unit.total_area)}<span className="sm:hidden"> /m²</span></> : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {filteredUnits.length === 0 && (
                    <tr><td colSpan={columnCount} className="px-6 py-10 text-center text-[13px] text-gray-500">
                      {units.length === 0
                        ? (hasFloorStep ? 'Todavía no hay unidades cargadas.' : `Todavía no hay ${pluralize(unitLabelLower)} ${uAgree.cargado}s.`)
                        : (hasFloorStep ? 'Ninguna unidad coincide con el filtro.' : `${uAgree.ningun === 'ninguna' ? 'Ninguna' : 'Ningún'} ${unitLabelLower} coincide con el filtro.`)}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredUnits.length > 0 && (
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center gap-x-6 gap-y-1 flex-wrap text-xs text-gray-600">
                <span className="font-semibold text-gray-900">{filteredUnits.length} {hasFloorStep ? 'unidades' : `${pluralize(unitLabelLower)}`} en la vista</span>
                {typeConfig.showStatus && (
                  <span>
                    {filteredUnits.filter(u => u.status === 'available').length} disponibles · {filteredUnits.filter(u => u.status === 'reserved').length} reservadas · {filteredUnits.filter(u => u.status === 'sold').length} vendidas
                  </span>
                )}
                {typeConfig.showPrice && (
                  <span className="sm:ml-auto">
                    <b className="font-semibold text-gray-900">{money(filteredUnits.reduce((sum, u) => sum + (u.price || 0), 0))}</b>
                    {(() => {
                      const totalArea = filteredUnits.reduce((sum, u) => sum + (u.total_area || 0), 0);
                      const totalVal = filteredUnits.reduce((sum, u) => sum + (u.price || 0), 0);
                      return totalArea ? ` · ${money(totalVal / totalArea)}/m²` : '';
                    })()}
                  </span>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {pending && (
        <div className="fixed inset-0 z-[300] bg-gray-900/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="paste-title" onClick={() => !applyingPaste && setPending(null)}>
          <div className="w-full max-w-[560px] rounded-2xl bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <h2 id="paste-title" className="m-0 font-display text-xl font-semibold text-gray-900">Pegar desde Excel</h2>
              <p className="m-0 mt-1 text-[13px] text-gray-600">
                {pending.changes.length} cambio{pending.changes.length === 1 ? '' : 's'} para revisar
                {pending.skipped > 0 && <> · <span className="text-amber-800">{pending.skipped} celda{pending.skipped === 1 ? '' : 's'} sin entender (se ignoran)</span></>}
              </p>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-gray-500">
                    <th className="px-5 py-2 font-semibold">{hasFloorStep ? 'Unidad' : unitLabel}</th>
                    <th className="px-3 py-2 font-semibold">Campo</th>
                    <th className="px-3 py-2 font-semibold">Antes</th>
                    <th className="px-5 py-2 font-semibold">Ahora</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.changes.slice(0, 300).map((ch, i) => (
                    <Fragment key={`${ch.unit.id}-${ch.col}-${i}`}>
                      <tr className="border-t border-gray-100">
                        <td className="px-5 py-2 font-semibold text-gray-900 whitespace-nowrap">{ch.unit.code}</td>
                        <td className="px-3 py-2 text-gray-600">{{ area: 'm²', orientation: 'Orientación', status: 'Estado', price: 'Precio' }[ch.col]}</td>
                        <td className="px-3 py-2 text-gray-500 line-through whitespace-nowrap">{ch.from}</td>
                        <td className="px-5 py-2 font-semibold text-gray-900 whitespace-nowrap">{ch.to}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {pending.changes.length > 300 && <p className="m-0 px-5 py-2 text-xs text-gray-600">…y {pending.changes.length - 300} más.</p>}
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2 flex-wrap">
              <button type="button" onClick={() => setPending(null)} disabled={applyingPaste} className={btnSecondary}>Cancelar</button>
              <button type="button" onClick={applyPaste} disabled={applyingPaste} className={btnPrimary}>
                {applyingPaste ? 'Guardando…' : `Aplicar ${pending.changes.length} cambio${pending.changes.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </m.div>
  );
}

// Colores del corte (diseño): disponible, reservada, vendida, incompleta.
const CORTE_COLOR: Record<UnitStatus, string> = { available: '#9DB3A5', reserved: '#E3B567', sold: '#2B302D' };
const INCOMPLETE_BG = 'repeating-linear-gradient(135deg, #F6E9D3 0 3px, #FDF9F1 3px 6px)';
