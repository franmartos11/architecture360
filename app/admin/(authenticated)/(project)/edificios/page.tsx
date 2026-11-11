'use client';

import { useState, useEffect, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import { PageSkeleton, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import ImageUploader from '@/components/admin/ImageUploader';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement, unitAgreement } from '@/lib/project-types';
import type { BuildingRow as DbBuildingRow } from '@/types/database';

import { pluralize } from '@/lib/units';
// floors_loaded/floors_with_plan/units_count/has_silhouette/first_floor_id
// no son columnas reales — las agrega /api/admin/buildings enriqueciendo
// cada fila con queries en lotes (ver ese archivo).
type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors' | 'cover_image'> & {
  floors_loaded: number;
  floors_with_plan: number;
  units_count: number;
  has_silhouette: boolean;
  first_floor_id: string | null;
};

export default function AdminBuildingsPage() {
  const router = useRouter();
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel, aerialLabel } = typeConfig;
  // "casa" y "loteo": una sola cosa por proyecto. No tiene sentido una
  // lista con una fila — al entrar acá se va derecho al editor (datos de
  // la casa / lotes de la etapa).
  const isSingleBuilding = typeConfig.singleBuilding;
  const agree = buildingAgreement(typeConfig);
  const uAgree = unitAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  const aerialLower = aerialLabel.toLowerCase();
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [firstSlideId, setFirstSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [form, setForm] = useState({ name: '', totalFloors: 1, planImage: '' });
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [redirectFailed, setRedirectFailed] = useState(false);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const confirmDialog = useConfirm();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    // Para casa solo hace falta el edificio (para el redirect); el resto
    // (slides de la vista frontal) no se muestra porque no se llega a
    // renderizar la lista.
    const reqs: Promise<unknown>[] = [fetch(withActiveProject('/api/admin/buildings', activeProjectId)).then(res => res.json())];
    if (!isSingleBuilding) reqs.push(fetch(withActiveProject('/api/admin/project', activeProjectId)).then(res => res.json()));
    Promise.all(reqs).then(([buildingsData, projectData]) => {
      const list = Array.isArray(buildingsData) ? (buildingsData as BuildingRow[]) : [];
      setBuildings(list);
      if (projectData) setFirstSlideId((projectData as { slides?: { id: string }[] }).slides?.[0]?.id ?? null);
      // casa: al editor de datos directo — con el first_floor_id que ya vino
      // en la misma respuesta (sin un fetch extra).
      if (isSingleBuilding && list[0]?.first_floor_id) {
        setRedirecting(true);
        router.replace(`/admin/edificios/${list[0].id}/pisos/${list[0].first_floor_id}`);
        return;
      }
      if (isSingleBuilding) setRedirectFailed(true);
      setLoading(false);
    }).catch((err) => {
      console.error(err);
      setLoadError(true);
      setLoading(false);
    });
  };

  useEffect(load, [activeProjectId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name) return;
    setCreating(true);
    const res = await fetch(withActiveProject('/api/admin/buildings', activeProjectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, totalFloors: form.totalFloors, planImage: form.planImage || null }),
    });
    if (!res.ok) {
      setCreating(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Error al crear ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`);
      return;
    }
    // El piso interno (y, para "casa", su única unidad) los crea el POST de
    // /api/admin/buildings para las formas sin paso "Piso" — ver esa ruta.
    setCreating(false);
    setForm({ name: '', totalFloors: 1, planImage: '' });
    setNewOpen(false);
    load();
  };

  const handleDelete = async (b: BuildingRow) => {
    const ok = await confirmDialog({
      title: `¿Borrar "${b.name}"?`,
      message: hasFloorStep
        ? `Se van a borrar también sus pisos, unidades y la silueta/pin que tenga en la ${aerialLower}. Esta acción no se puede deshacer.`
        : `Se van a borrar también sus ${pluralize(unitLabelLower)} y la silueta/pin que tenga en la ${aerialLower}. Esta acción no se puede deshacer.`,
      confirmLabel: `Borrar ${buildingLabelLower}`,
      danger: true,
    });
    if (!ok) return;
    setDeletingId(b.id);
    const res = await fetch(`/api/admin/buildings/${b.id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (res.ok) {
      toast(hasFloorStep ? 'Edificio borrado.' : `${buildingLabel} ${agree.borrado}.`);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? `Error al borrar ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`, 'error');
    }
  };

  const handleDuplicate = async (b: BuildingRow) => {
    setDuplicatingId(b.id);
    const res = await fetch(`/api/admin/buildings/${b.id}/duplicate`, { method: 'POST' });
    setDuplicatingId(null);
    if (res.ok) {
      toast(`${buildingLabel} duplicad${agree.el === 'la' ? 'a' : 'o'}.`);
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? `Error al duplicar ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`, 'error');
    }
  };

  if (loading || redirecting || (isSingleBuilding && buildings.length > 0 && !redirectFailed)) {
    return (
      <PageSkeleton actions={1}>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          {Array.from({ length: 3 }, (_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      </PageSkeleton>
    );
  }
  if (loadError) return <ErrorState message={`No se pudieron cargar ${hasFloorStep ? 'los edificios' : `${agree.el === 'la' ? 'las' : 'los'} ${pluralize(buildingLabelLower)}`}.`} onRetry={load} />;

  const totalUnits = buildings.reduce((n, b) => n + b.units_count, 0);
  const totalFloors = buildings.reduce((n, b) => n + b.floors_loaded, 0);

  return (
    <div className="flex flex-col gap-7">
      <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
        <div className="min-w-0 flex flex-col gap-2.5 flex-[1_1_420px]">
          <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">Estructura</p>
          <h1 className="m-0 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">{pluralize(buildingLabel)}</h1>
          <p className="m-0 text-[15px] leading-relaxed text-gray-600 max-w-[640px]">
            {buildings.length > 0 && (
              <span className="text-gray-900">
                {buildings.length} {buildings.length === 1 ? buildingLabelLower : pluralize(buildingLabelLower)}
                {hasFloorStep ? ` · ${totalFloors} pisos` : ''} · {totalUnits} {totalUnits === 1 ? unitLabelLower : pluralize(unitLabelLower)}
                {' — '}
              </span>
            )}
            {hasFloorStep
              ? 'cada torre con sus pisos, unidades y su silueta en la foto aérea.'
              : hasUnitStep
              ? `entrá a cada ${agree.uno} para gestionar sus ${pluralize(unitLabelLower)}.`
              : `entrá a cada ${agree.uno} para completar sus datos.`}
          </p>
          {!firstSlideId && (
            <p className="m-0 text-[13px] text-amber-800 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 self-start">
              {hasUnitStep
                ? `Para poder delimitar la silueta de ${hasFloorStep ? 'una torre' : `${agree.un} ${buildingLabelLower}`} en la foto, primero cargá al menos una ${aerialLower} en `
                : `Para poder marcar ${agree.el} ${buildingLabelLower} sobre la foto del frente, primero cargá la ${aerialLower} en `}
              <Link href="/admin/proyecto" className="font-semibold underline underline-offset-2">Proyecto</Link>.
            </p>
          )}
        </div>
        {/* Formas "de una sola cosa" (casa, loteo): una vez creada la única
            casa/etapa, no hay alta de una segunda (el server también lo
            rechaza) — el botón no tiene sentido si ya existe una. */}
        {!(typeConfig.singleBuilding && buildings.length > 0) && (
          <button
            type="button" onClick={() => setNewOpen(o => !o)}
            className="min-h-[44px] px-4 flex items-center gap-2 bg-brand-700 text-white text-sm font-semibold rounded-[10px] hover:bg-brand-800 transition-colors whitespace-nowrap"
          >
            <span className="text-base leading-none" aria-hidden="true">+</span> Nuevo {buildingLabelLower}
          </button>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
        {buildings.map(b => {
          const isDeleting = deletingId === b.id;
          const isDuplicating = duplicatingId === b.id;
          const isBusy = isDeleting || isDuplicating;
          const planReady = hasFloorStep ? b.floors_with_plan >= b.total_floors && b.floors_loaded >= b.total_floors : b.floors_with_plan > 0;
          const unitsReady = b.units_count > 0;
          const complete = planReady && unitsReady && (!firstSlideId || b.has_silhouette);
          return (
            <div key={b.id} className={`flex flex-col rounded-2xl border border-gray-200 bg-white overflow-hidden ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="p-[18px] flex items-start gap-3">
                <div className="w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-gray-900 text-white flex items-center justify-center font-display text-sm font-semibold">
                  {b.cover_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{b.name.trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="m-0 font-display text-[19px] font-semibold tracking-[-0.02em] text-gray-900 truncate">{b.name}</p>
                  <p className="m-0 text-xs text-gray-600 mt-0.5 truncate">
                    {hasFloorStep ? `${b.floors_loaded} pisos · ` : ''}{b.units_count} {b.units_count === 1 ? unitLabelLower : pluralize(unitLabelLower)}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-full ${
                  complete ? 'bg-brand-100 text-brand-800' : 'bg-amber-100 text-amber-800'
                }`}>
                  {complete ? 'Completo' : 'Falta cargar'}
                </span>
              </div>

              <div className="px-[18px] pb-4 flex flex-col gap-1">
                {hasFloorStep && (
                  <BuildingCheck
                    ok={planReady}
                    label={planReady ? `${b.floors_loaded} pisos con plano` : `${b.floors_with_plan} de ${b.total_floors} pisos con plano`}
                    action={planReady ? 'Ver' : 'Cargar →'}
                    href={`/admin/edificios/${b.id}`}
                  />
                )}
                <BuildingCheck
                  ok={unitsReady}
                  label={unitsReady ? `${b.units_count} ${b.units_count === 1 ? unitLabelLower : pluralize(unitLabelLower)} ${uAgree.cargado}${b.units_count === 1 ? '' : 's'}` : `Todavía sin ${pluralize(unitLabelLower)}`}
                  action={unitsReady ? 'Ver' : 'Cargar →'}
                  href={hasFloorStep ? `/admin/edificios/${b.id}` : `/admin/edificios/${b.id}/pisos/${b.first_floor_id ?? ''}`}
                />
                {firstSlideId && (
                  <BuildingCheck
                    ok={b.has_silhouette}
                    label={b.has_silhouette ? 'Silueta marcada en la foto' : `Sin silueta en la ${aerialLower}`}
                    action={b.has_silhouette ? 'Editar' : 'Marcar →'}
                    href={`/admin/proyecto/aereas/${firstSlideId}?building=${b.id}`}
                  />
                )}
              </div>

              <div className="mt-auto px-[18px] py-3 border-t border-gray-200 flex items-center gap-1">
                <Link
                  href={`/admin/edificios/${b.id}`}
                  className="min-h-[40px] px-3.5 flex items-center bg-gray-900 text-white rounded-[10px] text-[13px] font-semibold hover:bg-black transition-colors"
                >
                  {hasFloorStep ? 'Gestionar pisos →' : hasUnitStep ? `${pluralize(unitLabel)} →` : 'Editar →'}
                </Link>
                <div className="flex-1" />
                <button
                  type="button" onClick={() => handleDuplicate(b)} disabled={isBusy}
                  className="min-h-[40px] px-3 rounded-[10px] text-[13px] font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  {isDuplicating ? 'Duplicando...' : 'Duplicar'}
                </button>
                <button
                  type="button" onClick={() => handleDelete(b)} disabled={isBusy}
                  className="min-h-[40px] px-3 rounded-[10px] text-[13px] font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Borrando...' : 'Borrar'}
                </button>
              </div>
            </div>
          );
        })}

        {!(typeConfig.singleBuilding && buildings.length > 0) && (
          <button
            type="button" onClick={() => setNewOpen(true)}
            className="min-h-[190px] border-[1.5px] border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 px-4 hover:bg-white/60 hover:border-gray-400 transition-colors"
          >
            <span className="text-xl leading-none text-gray-700" aria-hidden="true">+</span>
            <span className="text-sm font-semibold text-gray-900">Nuevo {buildingLabelLower}</span>
            <span className="text-xs text-gray-600 text-center max-w-[220px] leading-relaxed">
              {hasFloorStep ? 'Nombre y cuántos pisos tiene. Los pisos se crean vacíos y los cargás después.' : `Nombre ${agree.del} ${buildingLabelLower}. El resto se carga después.`}
            </span>
          </button>
        )}
      </div>

      {buildings.length === 0 && (
        <p className="m-0 text-sm text-gray-600">Todavía no hay {pluralize(buildingLabel.toLowerCase())}.</p>
      )}

      {typeConfig.singleBuilding && buildings.length > 0 && (
        <p className="m-0 text-sm text-gray-600">
          {typeConfig.unitIsLand
            ? 'Este loteo ya tiene su etapa. Para desarrollos con varias etapas, escribinos.'
            : `Este proyecto ya tiene ${agree.esta} ${buildingLabelLower} — no admite más de una.`}
        </p>
      )}

      {newOpen && (
        <div className="rounded-2xl border border-gray-200 bg-white">
          <div className="px-5 sm:px-6 pt-5 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="m-0 font-display text-xl font-semibold tracking-[-0.02em] text-gray-900">Nuevo {buildingLabelLower}</h2>
            <div className="flex items-center gap-1">
              <Link href="/admin/wizard" className="min-h-[40px] flex items-center px-2 text-[13px] font-semibold text-gray-900 underline underline-offset-2 whitespace-nowrap">
                Usar el asistente →
              </Link>
              <button type="button" onClick={() => setNewOpen(false)} aria-label="Cerrar" className="w-10 h-10 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900">✕</button>
            </div>
          </div>
          <p className="m-0 px-5 sm:px-6 pt-2 text-[13px] text-gray-600">
            {hasFloorStep
              ? 'Este formulario solo crea el edificio. Para cargar pisos, unidades, delimitación y tour de una — paso a paso — usá el asistente.'
              : hasUnitStep
              ? `Este formulario solo crea ${agree.el} ${buildingLabelLower}. Para cargar el plano, ${pluralize(unitLabelLower)}, delimitación y tour de una — paso a paso — usá el asistente.`
              : `Este formulario solo crea ${agree.el} ${buildingLabelLower}. Para cargar el resto de los datos, fotos, ambientes y tour — paso a paso — usá el asistente.`}
          </p>
          <form onSubmit={handleCreate} className="p-5 sm:p-6 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Nombre"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={hasFloorStep ? 'Torre D' : `${buildingLabel} 1`}
                  autoFocus
                  required
                />
              </div>
              {hasFloorStep && (
                <div className="w-full sm:w-32">
                  <Input
                    label="Pisos"
                    type="number" min={1}
                    value={form.totalFloors}
                    onChange={e => setForm({ ...form, totalFloors: Number(e.target.value) })}
                  />
                </div>
              )}
              <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                {creating ? 'Creando...' : `+ Crear ${buildingLabel.toLowerCase()}`}
              </Button>
            </div>
            {!hasFloorStep && hasUnitStep && (
              <ImageUploader
                label="Plano de subdivisión (opcional, lo podés subir después)"
                value={form.planImage}
                onChange={url => setForm({ ...form, planImage: url })}
                folder="floorplans"
              />
            )}
          </form>
          {error && <p role="alert" className="m-0 px-5 sm:px-6 pb-4 text-sm text-red-700">{error}</p>}
        </div>
      )}
    </div>
  );
}

function BuildingCheck({ ok, label, action, href }: { ok: boolean; label: string; action: string; href: string }) {
  return (
    <div className="flex items-center gap-2.5 min-h-[34px]">
      <span className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold ${ok ? 'bg-brand-100 text-brand-800' : 'border-[1.5px] border-dashed border-gray-300'}`} aria-hidden="true">
        {ok ? '✓' : ''}
      </span>
      <span className="flex-1 min-w-0 text-[13px] text-gray-700 truncate">{label}</span>
      <Link href={href} className={`shrink-0 min-h-[32px] flex items-center text-xs ${ok ? 'text-gray-600 hover:text-gray-900' : 'font-semibold text-gray-900 underline underline-offset-2'}`}>
        {action}
      </Link>
    </div>
  );
}
