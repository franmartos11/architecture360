'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';

interface BuildingRow {
  id: string;
  slug: string;
  name: string;
  total_floors: number;
  floors_loaded: number;
}

export default function AdminBuildingsPage() {
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [firstSlideId, setFirstSlideId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ slug: '', name: '', totalFloors: 1 });
  const [error, setError] = useState('');

  const load = () => {
    Promise.all([
      fetch('/api/admin/buildings').then(res => res.json()),
      fetch('/api/admin/project').then(res => res.json()),
    ]).then(([buildingsData, projectData]) => {
      setBuildings(Array.isArray(buildingsData) ? buildingsData : []);
      setFirstSlideId(projectData.slides?.[0]?.id ?? null);
      setLoading(false);
    });
  };

  useEffect(load, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.slug || !form.name) return;
    setCreating(true);
    const res = await fetch('/api/admin/buildings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (res.ok) {
      setForm({ slug: '', name: '', totalFloors: 1 });
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al crear el edificio.');
    }
  };

  if (loading) return <div className="text-gray-500">Cargando edificios...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Edificios</h2>
        <p className="text-sm text-gray-500 mt-1">Torres del proyecto. Entrá a cada uno para gestionar sus pisos.</p>
        {!firstSlideId && (
          <p className="text-sm text-amber-600 mt-2">
            Para poder delimitar la silueta de una torre en la foto aérea, primero cargá al menos una vista aérea en{' '}
            <Link href="/admin/proyecto" className="underline hover:text-amber-700">Proyecto</Link>.
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">Nombre</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">Slug (URL)</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">Pisos declarados</th>
              <th className="px-6 py-4 text-sm font-semibold text-gray-900">Pisos cargados</th>
              <th className="px-6 py-4"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {buildings.map(b => (
              <tr key={b.id} className="hover:bg-gray-50/50 transition-colors">
                <td className="px-6 py-4 font-medium text-gray-900">{b.name}</td>
                <td className="px-6 py-4 text-sm text-gray-500 font-mono">{b.slug}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{b.total_floors}</td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {b.floors_loaded}
                  {b.floors_loaded < b.total_floors && (
                    <span className="text-amber-600 ml-1.5">· faltan {b.total_floors - b.floors_loaded}</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right space-x-3 whitespace-nowrap">
                  {firstSlideId && (
                    <Link
                      href={`/admin/proyecto/aereas/${firstSlideId}?building=${b.id}`}
                      className="text-sm font-medium text-gray-500 hover:text-gray-700"
                    >
                      Foto aérea →
                    </Link>
                  )}
                  <Link href={`/admin/edificios/${b.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                    Gestionar pisos →
                  </Link>
                </td>
              </tr>
            ))}
            {buildings.length === 0 && (
              <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Todavía no hay edificios.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Nuevo edificio</h3>
        </div>
        <form onSubmit={handleCreate} className="p-6 flex flex-col sm:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Torre D"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              required
            />
          </div>
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Slug (para la URL)</label>
            <input
              value={form.slug}
              onChange={e => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') })}
              placeholder="torre-d"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-sm"
              required
            />
          </div>
          <div className="w-full sm:w-32">
            <label className="block text-sm font-medium text-gray-700 mb-1">Pisos</label>
            <input
              type="number" min={1}
              value={form.totalFloors}
              onChange={e => setForm({ ...form, totalFloors: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {creating ? 'Creando...' : '+ Crear edificio'}
          </button>
        </form>
        {error && <p className="px-6 pb-4 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
