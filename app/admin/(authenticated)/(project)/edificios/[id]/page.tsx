'use client';

import { useState, useEffect, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import DuplicateFloorModal from '@/components/admin/DuplicateFloorModal';
import ApplyTemplateModal from '@/components/admin/ApplyTemplateModal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import { FLOOR_KIND_OPTIONS } from '@/lib/floorKinds';
import type { BuildingRow as DbBuildingRow, FloorRow as DbFloorRow } from '@/types/database';

type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors' | 'cover_image'>;
type FloorRow = Pick<DbFloorRow, 'id' | 'number' | 'label' | 'plan_image' | 'floor_kind' | 'floor_kind_description'>;
interface FloorUnitSummary {
  floor_id: string;
  interior_image_url: string | null;
  price: number | null;
}

export default function AdminBuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, buildingLabel, unitLabel } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const unitLabelLower = unitLabel.toLowerCase();

  const [building, setBuilding] = useState<BuildingRow | null>(null);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [unitSummaries, setUnitSummaries] = useState<FloorUnitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFloor, setNewFloor] = useState({ number: '', label: '', planImage: '', floorKind: 'units' as DbFloorRow['floor_kind'], floorKindDescription: '' });
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/buildings/${id}`)
      .then(res => res.json())
      .then(data => {
        setBuilding(data.building);
        setFloors(data.floors ?? []);
        setUnitSummaries(data.units ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [id]);

  const completeness = (floorId: string) => {
    const floorUnits = unitSummaries.filter(u => u.floor_id === floorId);
    const missingPhoto = floorUnits.filter(u => !u.interior_image_url).length;
    const missingPrice = floorUnits.filter(u => u.price == null).length;
    return { total: floorUnits.length, missingPhoto, missingPrice };
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building) return;
    setSaving(true);
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: building.name, totalFloors: building.total_floors, coverImage: building.cover_image }),
    });
    setSaving(false);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
  };

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newFloor.number === '' || !newFloor.label) return;
    const res = await fetch('/api/admin/floors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        buildingId: id,
        number: Number(newFloor.number),
        label: newFloor.label,
        planImage: newFloor.planImage || null,
        floorKind: newFloor.floorKind,
        floorKindDescription: newFloor.floorKindDescription || null,
      }),
    });
    if (res.ok) {
      setNewFloor({ number: '', label: '', planImage: '', floorKind: 'units', floorKindDescription: '' });
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'Error al crear el piso.', 'error');
    }
  };

  const handleUpdateFloor = async (floorId: string, updates: Partial<FloorRow>) => {
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
    if (res.ok) {
      setFloors(prev => prev.map(f => (f.id === floorId ? { ...f, ...updates } : f)));
    } else {
      toast('Error al actualizar el piso.', 'error');
    }
  };

  const handleDeleteFloor = async (floorId: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este piso y todas sus unidades?', confirmLabel: 'Borrar piso', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const [duplicateTarget, setDuplicateTarget] = useState<FloorRow | null>(null);
  const [applyTemplateTarget, setApplyTemplateTarget] = useState<FloorRow | null>(null);

  if (loading) return <LoadingSpinner text={`Cargando ${buildingLabelLower}...`} tone="light" />;
  if (loadError || !building) return <ErrorState message={`No se pudo cargar ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/edificios" className="text-sm text-gray-500 hover:text-gray-700">← {buildingLabel}s</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{building.name}</h2>
          <p className="text-sm text-gray-500 mt-1 font-mono">{building.slug}</p>
        </div>
        {hasFloorStep && (
          <Link
            href={`/admin/edificios/${id}/recorrido`}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Recorrido 360° de la torre →
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Datos {hasFloorStep ? 'del edificio' : `${agree.del} ${buildingLabelLower}`}</h3>
        </CardHeader>
        <form onSubmit={handleSaveBuilding} className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="flex-1 w-full">
              <Input
                label="Nombre"
                value={building.name}
                onChange={e => setBuilding({ ...building, name: e.target.value })}
              />
            </div>
            {hasFloorStep && (
              <div className="w-full sm:w-40">
                <Input
                  label="Pisos declarados"
                  type="number" min={1}
                  value={building.total_floors}
                  onChange={e => setBuilding({ ...building, total_floors: Number(e.target.value) })}
                />
              </div>
            )}
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
          <ImageUploader
            label={hasFloorStep ? 'Foto del edificio' : `Foto ${agree.del} ${buildingLabelLower}`}
            value={building.cover_image ?? ''}
            onChange={url => setBuilding({ ...building, cover_image: url })}
            folder="buildings"
          />
        </form>
        {hasFloorStep && (
          <p className="px-6 pb-4 text-xs text-gray-500">
            "Pisos declarados" es solo informativo (para saber cuántos faltan cargar); los pisos reales del sitio son los de la tabla de abajo. La foto no se guarda sola, hacé click en "Guardar".
          </p>
        )}
      </Card>

      {hasFloorStep ? (
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Pisos</h3>
              <p className="text-sm text-gray-500">Cada piso necesita su plano para que el sitio pueda mostrar los deptos.</p>
            </div>
            <Link
              href={`/admin/wizard?buildingId=${id}&step=piso`}
              className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
            >
              🪄 Usar el asistente →
            </Link>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 border-b border-gray-100">
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900 w-24">Número</th>
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">Etiqueta</th>
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">Tipo</th>
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">Plano (URL)</th>
                  <th className="px-6 py-3 text-sm font-semibold text-gray-900">Completitud</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {floors.sort((a, b) => a.number - b.number).map(f => {
                  const c = completeness(f.id);
                  const isUnitsFloor = f.floor_kind === 'units';
                  return (
                  <tr key={f.id}>
                    <td className="px-6 py-3 text-sm text-gray-600">{f.number}</td>
                    <td className="px-6 py-3">
                      <input
                        defaultValue={f.label}
                        onBlur={e => e.target.value !== f.label && handleUpdateFloor(f.id, { label: e.target.value })}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                      />
                    </td>
                    <td className="px-6 py-3 min-w-[180px]">
                      <select
                        value={f.floor_kind}
                        onChange={e => handleUpdateFloor(f.id, { floor_kind: e.target.value as FloorRow['floor_kind'] })}
                        aria-label="Tipo de piso"
                        className="w-full text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                      >
                        {FLOOR_KIND_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                        ))}
                      </select>
                      {!isUnitsFloor && (
                        <input
                          defaultValue={f.floor_kind_description ?? ''}
                          placeholder="Ej: Pileta y solárium"
                          onBlur={e => e.target.value !== (f.floor_kind_description ?? '') && handleUpdateFloor(f.id, { floor_kind_description: e.target.value })}
                          className="mt-1.5 w-full text-xs border border-gray-200 rounded-lg px-2.5 py-1 focus:ring-2 focus:ring-brand-500 outline-none"
                        />
                      )}
                    </td>
                    <td className="px-6 py-3 min-w-[280px]">
                      <ImageUploader
                        value={f.plan_image ?? ''}
                        onChange={url => handleUpdateFloor(f.id, { plan_image: url })}
                        folder="floorplans"
                      />
                    </td>
                    <td className="px-6 py-3 text-sm">
                      {isUnitsFloor ? (
                        c.total === 0 ? (
                          !f.plan_image ? (
                            <span className="text-amber-600">Sin unidades ni plano</span>
                          ) : (
                            <span className="text-gray-400">Sin unidades</span>
                          )
                        ) : (
                          <div className="space-y-0.5">
                            <span className="text-gray-600">{c.total} unidad{c.total === 1 ? '' : 'es'}</span>
                            {c.missingPhoto > 0 && <span className="block text-amber-600">{c.missingPhoto} sin foto</span>}
                            {c.missingPrice > 0 && <span className="block text-amber-600">{c.missingPrice} sin precio</span>}
                            {c.missingPhoto === 0 && c.missingPrice === 0 && <span className="block text-green-600">Completo</span>}
                          </div>
                        )
                      ) : !f.plan_image ? (
                        <span className="text-amber-600">Falta el plano</span>
                      ) : (
                        <span className="text-green-600">Completo</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right space-x-3 whitespace-nowrap">
                      <Link href={`/admin/edificios/${id}/pisos/${f.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                        Unidades →
                      </Link>
                      <button onClick={() => setDuplicateTarget(f)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Duplicar</button>
                      {isUnitsFloor && c.total === 0 && floors.length > 1 && (
                        <button onClick={() => setApplyTemplateTarget(f)} className="text-sm font-medium text-gray-600 hover:text-gray-900">Aplicar plantilla</button>
                      )}
                      <button onClick={() => handleDeleteFloor(f.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                    </td>
                  </tr>
                  );
                })}
                {floors.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Todavía no hay pisos cargados.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <form onSubmit={handleAddFloor} className="p-6 bg-gray-50/50 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="w-full sm:w-24 shrink-0">
                <Input
                  type="number" placeholder="N°"
                  value={newFloor.number}
                  onChange={e => setNewFloor({ ...newFloor, number: e.target.value })}
                  aria-label="Número de piso"
                />
              </div>
              <div className="flex-1">
                <Input
                  placeholder="Etiqueta (ej: Planta 1)"
                  value={newFloor.label}
                  onChange={e => setNewFloor({ ...newFloor, label: e.target.value })}
                  aria-label="Etiqueta del piso"
                />
              </div>
              <div className="w-full sm:w-44 shrink-0">
                <select
                  value={newFloor.floorKind}
                  onChange={e => setNewFloor({ ...newFloor, floorKind: e.target.value as typeof newFloor.floorKind })}
                  aria-label="Tipo de piso"
                  className="w-full h-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                >
                  {FLOOR_KIND_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.icon} {o.label}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                + Agregar piso
              </Button>
            </div>
            {newFloor.floorKind !== 'units' && (
              <Input
                placeholder="Qué hay en este piso (ej: Pileta y solárium)"
                value={newFloor.floorKindDescription}
                onChange={e => setNewFloor({ ...newFloor, floorKindDescription: e.target.value })}
                aria-label="Descripción del tipo de piso"
              />
            )}
            <ImageUploader
              value={newFloor.planImage}
              onChange={url => setNewFloor({ ...newFloor, planImage: url })}
              folder="floorplans"
            />
          </form>
        </Card>
      ) : (
        // Sin pisos reales: el building tiene un único piso interno
        // (creado solo al crear la Etapa) — acá se edita directo su plano
        // y se entra a delimitar/cargar sus lotes, sin la tabla de pisos.
        <Card>
          <CardHeader>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Plano de subdivisión</h3>
              <p className="text-sm text-gray-500">El plano sobre el que vas a delimitar cada {unitLabel.toLowerCase()}.</p>
            </div>
            {floors[0] && (
              <Link
                href={`/admin/edificios/${id}/pisos/${floors[0].id}`}
                className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap shrink-0"
              >
                {unitLabel}s →
              </Link>
            )}
          </CardHeader>
          <div className="p-6 space-y-4">
            {floors[0] ? (
              <>
                <ImageUploader
                  value={floors[0].plan_image ?? ''}
                  onChange={url => handleUpdateFloor(floors[0].id, { plan_image: url })}
                  folder="floorplans"
                />
                {(() => {
                  const c = completeness(floors[0].id);
                  if (c.total === 0) return <p className="text-sm text-gray-400">Todavía no hay {unitLabelLower}s {uAgree.cargado}s.</p>;
                  return (
                    <p className="text-sm text-gray-600">
                      {c.total} {unitLabelLower}{c.total === 1 ? '' : 's'}
                      {c.missingPhoto > 0 && <span className="text-amber-600"> · {c.missingPhoto} sin foto</span>}
                      {c.missingPrice > 0 && <span className="text-amber-600"> · {c.missingPrice} sin precio</span>}
                      {c.missingPhoto === 0 && c.missingPrice === 0 && <span className="text-green-600"> · Completo</span>}
                    </p>
                  );
                })()}
              </>
            ) : (
              <p className="text-sm text-gray-400">No se pudo encontrar el piso interno de {agree.esta} {buildingLabelLower} — probá recargar la página.</p>
            )}
          </div>
        </Card>
      )}

      {duplicateTarget && (
        <DuplicateFloorModal
          floor={duplicateTarget}
          onClose={() => setDuplicateTarget(null)}
          onDone={() => { setDuplicateTarget(null); load(); }}
        />
      )}

      {applyTemplateTarget && (
        <ApplyTemplateModal
          buildingId={id}
          targetFloor={applyTemplateTarget}
          onClose={() => setApplyTemplateTarget(null)}
          onDone={() => { setApplyTemplateTarget(null); load(); }}
        />
      )}
    </div>
  );
}
