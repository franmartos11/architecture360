'use client';

import { useState, useEffect } from 'react';
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

// floors_loaded no es una columna real — la agrega /api/admin/buildings
// enriqueciendo cada fila con el conteo de pisos cargados.
type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors'> & { floors_loaded: number };

export default function AdminBuildingsPage() {
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel, unitLabel } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const unitLabelLower = unitLabel.toLowerCase();
  const buildingLabelLower = buildingLabel.toLowerCase();
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [firstSlideId, setFirstSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', totalFloors: 1, planImage: '' });
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();
  const confirmDialog = useConfirm();

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetch('/api/admin/buildings').then(res => res.json()),
      fetch('/api/admin/project').then(res => res.json()),
    ]).then(([buildingsData, projectData]) => {
      setBuildings(Array.isArray(buildingsData) ? buildingsData : []);
      setFirstSlideId(projectData.slides?.[0]?.id ?? null);
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
      body: JSON.stringify({ name: form.name, totalFloors: form.totalFloors }),
    });
    if (!res.ok) {
      setCreating(false);
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? `Error al crear ${hasFloorStep ? 'el edificio' : `${agree.el} ${buildingLabelLower}`}.`);
      return;
    }
    if (!hasFloorStep) {
      // Sin paso "Piso" propio en este flujo tampoco — el building
      // necesita igual un único piso interno para poder colgarle
      // unidades, así que se crea acá mismo, invisible para el usuario.
      const created = await res.json();
      await fetch('/api/admin/floors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ buildingId: created.id, number: 1, label: 'Plano', planImage: form.planImage || null }),
      });
    }
    setCreating(false);
    setForm({ name: '', totalFloors: 1, planImage: '' });
    load();
  };

  const handleDelete = async (b: BuildingRow) => {
    const ok = await confirmDialog({
      title: `¿Borrar "${b.name}"?`,
      message: hasFloorStep
        ? 'Se van a borrar también sus pisos, unidades y la silueta/pin que tenga en la vista aérea. Esta acción no se puede deshacer.'
        : `Se van a borrar también sus ${unitLabelLower}s y la silueta/pin que tenga en la vista aérea. Esta acción no se puede deshacer.`,
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

  if (loading) return <LoadingSpinner text={`Cargando ${buildingLabel.toLowerCase()}s...`} tone="light" />;
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
            Para poder delimitar la silueta de {hasFloorStep ? 'una torre' : `${agree.un} ${buildingLabelLower}`} en la foto aérea, primero cargá al menos una vista aérea en{' '}
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
                        Delimitar en foto aérea →
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
    </div>
  );
}
