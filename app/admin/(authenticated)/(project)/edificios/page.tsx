'use client';

import { useState, useEffect, startTransition } from 'react';
import { useRouter } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import ImageUploader from '@/components/admin/ImageUploader';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import type { BuildingRow as DbBuildingRow } from '@/types/database';

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
  const confirmDialog = useConfirm();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    // Para casa solo hace falta el edificio (para el redirect); el resto
    // (slides de la vista frontal) no se muestra porque no se llega a
    // renderizar la lista.
    const reqs: Promise<unknown>[] = [fetch('/api/admin/buildings').then(res => res.json())];
    if (!isSingleBuilding) reqs.push(fetch('/api/admin/project').then(res => res.json()));
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

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name) return;
    setCreating(true);
    const res = await fetch('/api/admin/buildings', {
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
        : `Se van a borrar también sus ${unitLabelLower}s y la silueta/pin que tenga en la ${aerialLower}. Esta acción no se puede deshacer.`,
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
    return <LoadingSpinner text={isSingleBuilding ? `Abriendo ${agree.el} ${buildingLabelLower}...` : `Cargando ${buildingLabel.toLowerCase()}s...`} tone="light" />;
  }
  if (loadError) return <ErrorState message={`No se pudieron cargar ${hasFloorStep ? 'los edificios' : `${agree.el === 'la' ? 'las' : 'los'} ${buildingLabelLower}s`}.`} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{buildingLabel}s</h2>
          <p className="text-sm text-gray-500 mt-1">
            {hasFloorStep
              ? 'Cada torre con sus pisos, unidades y su silueta en la foto aérea.'
              : hasUnitStep
              ? `${buildingLabel}s del proyecto. Entrá a cada ${agree.uno} para gestionar sus ${unitLabelLower}s.`
              : `${buildingLabel}s del proyecto. Entrá a cada ${agree.uno} para completar sus datos.`}
          </p>
          {!firstSlideId && (
            <p className="text-sm text-amber-600 mt-2">
              {hasUnitStep
                ? `Para poder delimitar la silueta de ${hasFloorStep ? 'una torre' : `${agree.un} ${buildingLabelLower}`} en la foto, primero cargá al menos una ${aerialLower} en `
                : `Para poder marcar ${agree.el} ${buildingLabelLower} sobre la foto del frente, primero cargá la ${aerialLower} en `}
              <Link href="/admin/proyecto" className="underline hover:text-amber-700">Proyecto</Link>.
            </p>
          )}
        </div>
        {/* Formas "de una sola cosa" (casa, loteo): una vez creada la única
            casa/etapa, no hay alta de una segunda (el server también lo
            rechaza) — el botón no tiene sentido si ya existe una. */}
        {!(typeConfig.singleBuilding && buildings.length > 0) && (
          <button
            type="button" onClick={() => setNewOpen(o => !o)}
            className="h-9 px-4 flex items-center gap-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            <span className="text-base leading-none">+</span> Nuevo {buildingLabelLower}
          </button>
        )}
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {buildings.map(b => {
          const isDeleting = deletingId === b.id;
          const isDuplicating = duplicatingId === b.id;
          const isBusy = isDeleting || isDuplicating;
          const planReady = hasFloorStep ? b.floors_with_plan >= b.total_floors && b.floors_loaded >= b.total_floors : b.floors_with_plan > 0;
          const unitsReady = b.units_count > 0;
          const complete = planReady && unitsReady && (!firstSlideId || b.has_silhouette);
          return (
            <Card key={b.id} className={`overflow-hidden ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}>
              <div className="p-4 flex items-start gap-3">
                <div className="w-11 h-11 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {b.cover_image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={b.cover_image} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-[15px] truncate">{b.name}</p>
                  <p className="text-[10.5px] text-gray-400 font-mono mt-0.5 truncate">/{b.slug}</p>
                </div>
                <span className={`shrink-0 h-[22px] px-2.5 flex items-center rounded-md text-[10px] font-medium ${
                  complete ? 'bg-gray-900 text-white' : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}>
                  {complete ? 'Listo para publicar' : 'Falta cargar'}
                </span>
              </div>

              <div className="px-4 pb-3.5 flex flex-col gap-2">
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
                  label={unitsReady ? `${b.units_count} ${unitLabelLower}${b.units_count === 1 ? '' : 's'} cargad${b.units_count === 1 ? 'a' : 'as'}` : `Todavía sin ${unitLabelLower}s`}
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

              <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 flex items-center gap-2">
                <Link
                  href={`/admin/edificios/${b.id}`}
                  className="h-8 px-3 flex items-center bg-gray-900 text-white rounded-lg text-[11.5px] font-medium hover:bg-gray-800 transition-colors"
                >
                  {hasFloorStep ? 'Gestionar pisos →' : hasUnitStep ? `${unitLabel}s →` : 'Editar →'}
                </Link>
                <div className="flex-1" />
                <button
                  type="button" onClick={() => handleDuplicate(b)} disabled={isBusy}
                  className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors disabled:opacity-50"
                >
                  {isDuplicating ? 'Duplicando...' : 'Duplicar'}
                </button>
                <button
                  type="button" onClick={() => handleDelete(b)} disabled={isBusy}
                  className="h-8 px-2.5 rounded-lg text-[11.5px] font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'Borrando...' : 'Borrar'}
                </button>
              </div>
            </Card>
          );
        })}

        {!(typeConfig.singleBuilding && buildings.length > 0) && (
          <button
            type="button" onClick={() => setNewOpen(true)}
            className="min-h-[170px] border-[1.5px] border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-white/50 hover:bg-white hover:border-brand-500 transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-lg">+</span>
            <span className="text-sm font-medium text-gray-900">Nuevo {buildingLabelLower}</span>
            <span className="text-[11px] text-gray-500 text-center max-w-[220px] leading-relaxed">
              {hasFloorStep ? 'Nombre y cuántos pisos tiene. Los pisos se crean vacíos y los cargás después.' : `Nombre ${agree.del} ${buildingLabelLower}. El resto se carga después.`}
            </span>
          </button>
        )}
      </div>

      {buildings.length === 0 && (
        <p className="text-sm text-gray-400">Todavía no hay {buildingLabel.toLowerCase()}s.</p>
      )}

      {typeConfig.singleBuilding && buildings.length > 0 && (
        <p className="text-sm text-gray-400">
          {typeConfig.unitIsLand
            ? 'Este loteo ya tiene su etapa. Para desarrollos con varias etapas, escribinos.'
            : `Este proyecto ya tiene ${agree.esta} ${buildingLabelLower} — no admite más de una.`}
        </p>
      )}

      {newOpen && (
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">Nuevo {buildingLabelLower}</h3>
            <div className="flex items-center gap-3">
              <Link href="/admin/wizard" className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap">
                🪄 Usar el asistente →
              </Link>
              <button type="button" onClick={() => setNewOpen(false)} aria-label="Cerrar" className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
          </CardHeader>
          <p className="px-6 pt-4 text-xs text-gray-500">
            {hasFloorStep
              ? 'Este formulario solo crea el edificio. Para cargar pisos, unidades, delimitación y tour de una — paso a paso — usá el asistente.'
              : hasUnitStep
              ? `Este formulario solo crea ${agree.el} ${buildingLabelLower}. Para cargar el plano, ${unitLabelLower}s, delimitación y tour de una — paso a paso — usá el asistente.`
              : `Este formulario solo crea ${agree.el} ${buildingLabelLower}. Para cargar el resto de los datos, fotos, ambientes y tour — paso a paso — usá el asistente.`}
          </p>
          <form onSubmit={handleCreate} className="p-6 space-y-3">
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
          {error && <p className="px-6 pb-4 text-sm text-red-500">{error}</p>}
        </Card>
      )}
    </div>
  );
}

function BuildingCheck({ ok, label, action, href }: { ok: boolean; label: string; action: string; href: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${ok ? 'bg-brand-500' : 'border border-gray-300'}`}>
        {ok ? '✓' : ''}
      </span>
      <span className="flex-1 min-w-0 text-[11.5px] text-gray-700 truncate">{label}</span>
      <Link href={href} className={`shrink-0 text-[11px] font-medium ${ok ? 'text-gray-400 hover:text-gray-600' : 'text-brand-600 hover:text-brand-700'}`}>
        {action}
      </Link>
    </div>
  );
}
