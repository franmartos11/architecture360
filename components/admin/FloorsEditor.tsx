'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { HeadCheck } from '@/components/ui/HeadCheck';
import { FilterStat } from '@/components/ui/FilterStat';
import DuplicateFloorModal from '@/components/admin/DuplicateFloorModal';
import ApplyTemplateModal from '@/components/admin/ApplyTemplateModal';
import FloorPlanModal from '@/components/admin/FloorPlanModal';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { FLOOR_KIND_OPTIONS } from '@/lib/floorKinds';
import { floorStatus, floorStatusLabel } from '@/lib/floor-status';
import type { FloorRow, FloorKind } from '@/types/database';

type Floor = Pick<FloorRow, 'id' | 'number' | 'label' | 'plan_image' | 'floor_kind' | 'floor_kind_description'>;
export interface FloorUnitSummary {
  floor_id: string;
  interior_image_url: string | null;
  price: number | null;
}
type Filter = 'all' | 'noPlan' | 'noUnits';

// Editor de pisos de un edificio — lista compacta con edición en línea,
// fila clickeable a las unidades del piso, y un modal de plano en vez de
// un ImageUploader por fila (ver FloorPlanModal). Es a los pisos lo que
// UnitsEditor.tsx es a las unidades: misma densidad, mismo patrón de
// stat cards que filtran, misma alta rápida al pie de la lista.
export default function FloorsEditor({
  buildingId, floors, unitSummaries, showPrice, onChanged,
}: {
  buildingId: string;
  floors: Floor[];
  unitSummaries: FloorUnitSummary[];
  showPrice: boolean;
  onChanged: () => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'label' | 'description' } | null>(null);
  const [planTarget, setPlanTarget] = useState<Floor | null>(null);
  const [duplicateTarget, setDuplicateTarget] = useState<Floor | null>(null);
  const [applyTemplateTarget, setApplyTemplateTarget] = useState<Floor | null>(null);
  const [newFloor, setNewFloor] = useState({ number: '', label: '', floorKind: 'units' as FloorKind });
  const router = useRouter();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const completeness = (floorId: string) => {
    const floorUnits = unitSummaries.filter(u => u.floor_id === floorId);
    const missingPhoto = floorUnits.filter(u => !u.interior_image_url).length;
    // En modo showcase el precio no es un dato que vaya a cargarse nunca —
    // contarlo como "faltante" nunca dejaba llegar a "Completo" aunque el
    // resto sí estuviera (ver edificios/[id]/page.tsx, misma regla).
    const missingPrice = showPrice ? floorUnits.filter(u => u.price == null).length : 0;
    return { total: floorUnits.length, missingPhoto, missingPrice };
  };

  const handleUpdateFloor = async (floorId: string, updates: Partial<Floor>) => {
    const res = await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: updates.label,
        planImage: updates.plan_image,
        floorKind: updates.floor_kind,
        floorKindDescription: updates.floor_kind_description,
      }),
    });
    if (res.ok) onChanged();
    else toast('Error al actualizar el piso.', 'error');
  };

  const handleDeleteFloor = async (floorId: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este piso y todas sus unidades?', confirmLabel: 'Borrar piso', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' });
    if (res.ok) onChanged();
  };

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFloor.number === '' || !newFloor.label) return;
    const res = await fetch('/api/admin/floors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingId,
        number: Number(newFloor.number),
        label: newFloor.label,
        floorKind: newFloor.floorKind,
      }),
    });
    if (res.ok) {
      setNewFloor({ number: '', label: '', floorKind: 'units' });
      onChanged();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al crear el piso.', 'error');
    }
  };

  const noPlanCount = floors.filter(f => !f.plan_image).length;
  const noUnitsCount = floors.filter(f => f.floor_kind === 'units' && completeness(f.id).total === 0).length;
  const visible = floors.slice().sort((a, b) => a.number - b.number).filter(f => {
    if (filter === 'noPlan') return !f.plan_image;
    if (filter === 'noUnits') return f.floor_kind === 'units' && completeness(f.id).total === 0;
    return true;
  });

  const toggleSel = (floorId: string) => setSel(prev => {
    const next = new Set(prev);
    if (next.has(floorId)) next.delete(floorId); else next.add(floorId);
    return next;
  });
  const visibleFloorIds = visible.map(f => f.id);
  const allSelected = sel.size > 0 && visibleFloorIds.every(id => sel.has(id));
  const toggleSelAll = () => setSel(allSelected ? new Set() : new Set(visibleFloorIds));

  const bulkApplyFirstFloorPlan = async () => {
    const firstFloor = floors.slice().sort((a, b) => a.number - b.number)[0];
    if (!firstFloor?.plan_image) return;
    setBulkBusy(true);
    await Promise.all(Array.from(sel).map(floorId =>
      fetch(`/api/admin/floors/${floorId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planImage: firstFloor.plan_image }),
      })
    ));
    setBulkBusy(false);
    setSel(new Set());
    onChanged();
  };

  const bulkCycleType = async () => {
    const kinds = FLOOR_KIND_OPTIONS.map(o => o.value);
    setBulkBusy(true);
    await Promise.all(Array.from(sel).map(floorId => {
      const f = floors.find(x => x.id === floorId);
      if (!f) return Promise.resolve();
      const nextKind = kinds[(kinds.indexOf(f.floor_kind) + 1) % kinds.length];
      return fetch(`/api/admin/floors/${floorId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floorKind: nextKind }),
      });
    }));
    setBulkBusy(false);
    setSel(new Set());
    onChanged();
  };

  const bulkDeleteFloors = async () => {
    const ok = await confirmDialog({
      message: `¿Borrar ${sel.size} piso${sel.size === 1 ? '' : 's'} y todas sus unidades? No se puede deshacer.`,
      confirmLabel: 'Borrar', danger: true,
    });
    if (!ok) return;
    setBulkBusy(true);
    await Promise.all(Array.from(sel).map(floorId => fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' })));
    setBulkBusy(false);
    setSel(new Set());
    onChanged();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2.5 flex-wrap">
        <FilterStat value={floors.length} label="pisos cargados" active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterStat value={noPlanCount} label="sin plano" color={noPlanCount ? '#8a6118' : undefined} active={filter === 'noPlan'} onClick={() => setFilter('noPlan')} />
        <FilterStat value={noUnitsCount} label="sin unidades" color={noUnitsCount ? '#8a6118' : undefined} active={filter === 'noUnits'} onClick={() => setFilter('noUnits')} />
      </div>

      <Card>
        {sel.size > 0 && (
          <div className="mx-4 mt-4 bg-gray-900 rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap">
            <p className="flex-1 min-w-[140px] text-sm font-medium text-white">{sel.size} piso{sel.size === 1 ? '' : 's'} seleccionado{sel.size === 1 ? '' : 's'}</p>
            <button type="button" onClick={bulkApplyFirstFloorPlan} disabled={bulkBusy} className="h-8 px-2.5 border border-white/25 rounded-lg text-xs font-medium text-white/90 hover:bg-white/10 transition-colors disabled:opacity-50">Usar el plano del piso 1</button>
            <button type="button" onClick={bulkCycleType} disabled={bulkBusy} className="h-8 px-2.5 border border-white/25 rounded-lg text-xs font-medium text-white/90 hover:bg-white/10 transition-colors disabled:opacity-50">Cambiar tipo</button>
            <button type="button" onClick={bulkDeleteFloors} disabled={bulkBusy} className="h-8 px-2.5 border border-red-400/50 rounded-lg text-xs font-medium text-red-300 hover:bg-red-500/15 transition-colors disabled:opacity-50">Borrar</button>
            <button type="button" onClick={() => setSel(new Set())} aria-label="Deseleccionar todo" className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white">×</button>
          </div>
        )}

        <div className="flex items-center px-3.5 h-9 border-b border-gray-100 bg-gray-50/60">
          <HeadCheck checked={allSelected} onChange={toggleSelAll} />
          <span className="w-5 shrink-0" />
          <span className="w-10 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">N°</span>
          <span className="w-44 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Etiqueta</span>
          <span className="w-40 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Tipo</span>
          <span className="w-14 shrink-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Plano</span>
          <span className="flex-1 min-w-0 text-[10.5px] font-semibold text-gray-500 uppercase tracking-wide">Completitud</span>
        </div>

        <div>
          {visible.map(f => {
            const c = completeness(f.id);
            const isUnitsFloor = f.floor_kind === 'units';
            const status = floorStatus({ floorKind: f.floor_kind, hasPlan: !!f.plan_image, totalUnits: c.total, missingPhoto: c.missingPhoto, missingPrice: c.missingPrice });
            const label = floorStatusLabel({ floorKind: f.floor_kind, hasPlan: !!f.plan_image, totalUnits: c.total, missingPhoto: c.missingPhoto, missingPrice: c.missingPrice });
            const statusDot = status === 'complete' ? 'bg-brand-500' : status === 'partial' ? 'bg-amber-400' : 'bg-gray-200';
            const editingLabel = editingCell?.id === f.id && editingCell.field === 'label';
            const editingDescription = editingCell?.id === f.id && editingCell.field === 'description';

            return (
              <div
                key={f.id}
                onClick={() => router.push(`/admin/edificios/${buildingId}/pisos/${f.id}`)}
                className="flex items-center px-3.5 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <HeadCheck checked={sel.has(f.id)} onChange={() => toggleSel(f.id)} stop />
                <span className="w-5 shrink-0 flex items-center justify-center">
                  <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                </span>
                <span className="w-10 shrink-0 text-xs text-gray-600">{f.number}</span>
                <span className="w-44 shrink-0 pr-2" onClick={e => e.stopPropagation()}>
                  {editingLabel ? (
                    <input
                      autoFocus defaultValue={f.label}
                      onBlur={e => { if (e.target.value !== f.label) handleUpdateFloor(f.id, { label: e.target.value }); setEditingCell(null); }}
                      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                      className="h-7 w-full px-1.5 border border-brand-500 rounded text-xs outline-none"
                    />
                  ) : (
                    <span onClick={() => setEditingCell({ id: f.id, field: 'label' })} className="inline-flex h-7 items-center px-1.5 rounded hover:bg-gray-100 text-xs text-gray-900 w-full truncate">
                      {f.label}
                    </span>
                  )}
                  {!isUnitsFloor && (
                    editingDescription ? (
                      <input
                        autoFocus defaultValue={f.floor_kind_description ?? ''}
                        placeholder="Ej: Pileta y solárium"
                        onBlur={e => { if (e.target.value !== (f.floor_kind_description ?? '')) handleUpdateFloor(f.id, { floor_kind_description: e.target.value }); setEditingCell(null); }}
                        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="mt-1 h-6 w-full px-1.5 border border-brand-500 rounded text-[11px] outline-none"
                      />
                    ) : (
                      <span onClick={() => setEditingCell({ id: f.id, field: 'description' })} className="mt-0.5 block text-[11px] text-gray-400 hover:text-gray-600 truncate">
                        {f.floor_kind_description || 'Agregar descripción…'}
                      </span>
                    )
                  )}
                </span>
                <span className="w-40 shrink-0 pr-2" onClick={e => e.stopPropagation()}>
                  <select
                    value={f.floor_kind}
                    onChange={e => handleUpdateFloor(f.id, { floor_kind: e.target.value as FloorKind })}
                    aria-label="Tipo de piso"
                    className="w-full h-7 text-xs border border-gray-200 rounded-lg px-1.5 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  >
                    {FLOOR_KIND_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                    ))}
                  </select>
                </span>
                <span className="w-14 shrink-0" onClick={e => { e.stopPropagation(); setPlanTarget(f); }}>
                  {f.plan_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.plan_image} alt="" className="w-14 h-10 object-cover rounded-lg border border-gray-200 cursor-pointer" />
                  ) : (
                    <span className="w-14 h-10 flex items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-400 text-[10px] cursor-pointer hover:border-gray-400">+ plano</span>
                  )}
                </span>
                <span className="flex-1 min-w-0 text-xs">
                  <span className="text-gray-600">{isUnitsFloor ? `${c.total} unidad${c.total === 1 ? '' : 'es'} · ` : ''}</span>
                  <span className={status === 'complete' ? 'text-green-600' : status === 'partial' ? 'text-amber-600' : 'text-gray-400'}>{label}</span>
                </span>
                <span className="shrink-0 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <button type="button" title="Duplicar" onClick={() => setDuplicateTarget(f)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">⧉</button>
                  {isUnitsFloor && c.total === 0 && floors.length > 1 && (
                    <button type="button" title="Aplicar plantilla" onClick={() => setApplyTemplateTarget(f)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors">▦</button>
                  )}
                  <button type="button" title="Borrar" onClick={() => handleDeleteFloor(f.id)} className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors">×</button>
                </span>
              </div>
            );
          })}
          {visible.length === 0 && (
            floors.length === 0 ? (
              <div className="py-11 flex flex-col items-center gap-1.5 text-center px-6">
                <p className="text-sm font-medium text-gray-900">Todavía no hay pisos cargados.</p>
              </div>
            ) : (
              <div className="py-11 flex flex-col items-center gap-1.5 text-center px-6">
                <p className="text-sm font-medium text-gray-900">Ningún piso coincide con este filtro</p>
                <button type="button" onClick={() => setFilter('all')} className="text-sm font-medium text-brand-600 hover:text-brand-700">Ver todos los pisos</button>
              </div>
            )
          )}
        </div>

        <form onSubmit={handleAddFloor} className="flex items-center gap-2 px-3.5 py-2 bg-gray-50/60 border-t border-gray-100">
          <span className="w-6 text-center text-gray-300">+</span>
          <input
            type="number" value={newFloor.number}
            onChange={e => setNewFloor({ ...newFloor, number: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.form?.requestSubmit(); }}
            placeholder="N°"
            aria-label="Número de piso"
            className="h-8 w-16 px-2 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
          <input
            value={newFloor.label}
            onChange={e => setNewFloor({ ...newFloor, label: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.form?.requestSubmit(); }}
            placeholder="Etiqueta (ej: Planta 1)"
            aria-label="Etiqueta del piso"
            className="h-8 flex-1 min-w-[140px] px-2.5 text-xs rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-brand-500"
          />
          <select
            value={newFloor.floorKind}
            onChange={e => setNewFloor({ ...newFloor, floorKind: e.target.value as FloorKind })}
            aria-label="Tipo de piso"
            className="h-8 px-2 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand-500 bg-white"
          >
            {FLOOR_KIND_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
            ))}
          </select>
          <button
            type="submit" disabled={newFloor.number === '' || !newFloor.label}
            className="h-8 px-3.5 rounded-lg text-xs font-medium bg-gray-900 text-white disabled:bg-gray-200 disabled:text-gray-400 transition-colors whitespace-nowrap"
          >
            + Agregar piso
          </button>
        </form>
      </Card>

      {planTarget && (
        <FloorPlanModal
          floor={planTarget}
          onClose={() => setPlanTarget(null)}
          onSave={url => { handleUpdateFloor(planTarget.id, { plan_image: url }); setPlanTarget(prev => (prev ? { ...prev, plan_image: url } : prev)); }}
        />
      )}
      {duplicateTarget && (
        <DuplicateFloorModal
          floor={duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onDone={() => { setDuplicateTarget(null); onChanged(); }}
        />
      )}
      {applyTemplateTarget && (
        <ApplyTemplateModal
          buildingId={buildingId}
          targetFloor={applyTemplateTarget}
          onClose={() => setApplyTemplateTarget(null)}
          onDone={() => { setApplyTemplateTarget(null); onChanged(); }}
        />
      )}
    </div>
  );
}
