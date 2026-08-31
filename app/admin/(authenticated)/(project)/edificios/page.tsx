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

// floors_loaded / first_floor_id no son columnas reales — las agrega
// /api/admin/buildings enriqueciendo cada fila.
type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors'> & { floors_loaded: number; first_floor_id: string | null };

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
  const [form, setForm] = useState({ name: '', totalFloors: 1, planImage: '' });
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
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

  if (loading || redirecting || (isSingleBuilding && buildings.length > 0 && !redirectFailed)) {
    return <LoadingSpinner text={isSingleBuilding ? `Abriendo ${agree.el} ${buildingLabelLower}...` : `Cargando ${buildingLabel.toLowerCase()}s...`} tone="light" />;
  }
  if (loadError) return <ErrorState message={`No se pudieron cargar ${hasFloorStep ? 'los edificios' : `${agree.el === 'la' ? 'las' : 'los'} ${buildingLabelLower}s`}.`} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{buildingLabel}s</h2>
        <p className="text-sm text-gray-500 mt-1">
          {hasFloorStep
            ? 'Torres del proyecto. Entrá a cada uno para gestionar sus pisos.'
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

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Nombre</th>
                <th className="px-6 py-4 text-sm font-semibold text-gray-900">Slug (URL)</th>
                {hasFloorStep && <th className="px-6 py-4 text-sm font-semibold text-gray-900">Pisos declarados</th>}
                {hasFloorStep && <th className="px-6 py-4 text-sm font-semibold text-gray-900">Pisos cargados</th>}
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {buildings.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{b.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono">{b.slug}</td>
                  {hasFloorStep && <td className="px-6 py-4 text-sm text-gray-600">{b.total_floors}</td>}
                  {hasFloorStep && (
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {b.floors_loaded}
                      {b.floors_loaded < b.total_floors && (
                        <span className="text-amber-600 ml-1.5">· faltan {b.total_floors - b.floors_loaded}</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                    {firstSlideId && (
                      <Link
                        href={`/admin/proyecto/aereas/${firstSlideId}?building=${b.id}`}
                        className="text-sm font-medium text-gray-500 hover:text-gray-700"
                      >
                        {hasUnitStep ? 'Delimitar en foto aérea →' : 'Marcar en la vista frontal →'}
                      </Link>
                    )}
                    <Link href={`/admin/edificios/${b.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                      {hasFloorStep ? 'Gestionar pisos →' : hasUnitStep ? `${unitLabel}s →` : 'Editar →'}
                    </Link>
                    <button
                      onClick={() => handleDelete(b)}
                      disabled={deletingId === b.id}
                      className="text-sm text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === b.id ? 'Borrando...' : 'Borrar'}
                    </button>
                  </td>
                </tr>
              ))}
              {buildings.length === 0 && (
                <tr><td colSpan={hasFloorStep ? 5 : 3} className="px-6 py-10 text-center text-gray-400">Todavía no hay {buildingLabel.toLowerCase()}s.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Formas "de una sola cosa" (casa, loteo): una vez creada la única
          casa / etapa, no hay alta de una segunda (el server también lo
          rechaza). Para varias etapas de un loteo, contacto directo. */}
      {typeConfig.singleBuilding && buildings.length > 0 ? (
        <p className="text-sm text-gray-400">
          {typeConfig.unitIsLand
            ? 'Este loteo ya tiene su etapa. Para desarrollos con varias etapas, escribinos.'
            : `Este proyecto ya tiene ${agree.esta} ${buildingLabelLower} — no admite más de una.`}
        </p>
      ) : (
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">{hasFloorStep ? 'Nuevo' : (agree.el === 'la' ? 'Nueva' : 'Nuevo')} {buildingLabelLower}</h3>
          <Link href="/admin/wizard" className="text-sm font-medium text-brand-600 hover:text-brand-700 whitespace-nowrap">
            🪄 Usar el asistente →
          </Link>
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
