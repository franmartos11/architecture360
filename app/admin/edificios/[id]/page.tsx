'use client';

import { useState, useEffect, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';

interface BuildingRow {
  id: string;
  slug: string;
  name: string;
  total_floors: number;
}
interface FloorRow {
  id: string;
  number: number;
  label: string;
  plan_image: string | null;
}

export default function AdminBuildingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [building, setBuilding] = useState<BuildingRow | null>(null);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newFloor, setNewFloor] = useState({ number: '', label: '', planImage: '' });

  const load = () => {
    fetch(`/api/admin/buildings/${id}`)
      .then(res => res.json())
      .then(data => {
        setBuilding(data.building);
        setFloors(data.floors ?? []);
        setLoading(false);
      });
  };

  useEffect(load, [id]);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSaveBuilding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!building) return;
    setSaving(true);
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: building.name, totalFloors: building.total_floors }),
    });
    setSaving(false);
    flash(res.ok ? 'Guardado.' : 'Error al guardar.');
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
      }),
    });
    if (res.ok) {
      setNewFloor({ number: '', label: '', planImage: '' });
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      flash(data.error ?? 'Error al crear el piso.');
    }
  };

  const handleUpdateFloor = async (floorId: string, updates: Partial<FloorRow>) => {
    const res = await fetch(`/api/admin/floors/${floorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: updates.label,
        planImage: updates.plan_image,
      }),
    });
    if (res.ok) {
      setFloors(prev => prev.map(f => (f.id === floorId ? { ...f, ...updates } : f)));
    } else {
      flash('Error al actualizar el piso.');
    }
  };

  const handleDeleteFloor = async (floorId: string) => {
    if (!confirm('¿Borrar este piso y todas sus unidades?')) return;
    const res = await fetch(`/api/admin/floors/${floorId}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  if (loading || !building) return <div className="text-gray-500">Cargando edificio...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/edificios" className="text-sm text-gray-500 hover:text-gray-700">← Edificios</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">{building.name}</h2>
        <p className="text-sm text-gray-500 mt-1 font-mono">{building.slug}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Datos del edificio</h3>
        </div>
        <form onSubmit={handleSaveBuilding} className="p-6 flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 w-full">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
            <input
              value={building.name}
              onChange={e => setBuilding({ ...building, name: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-sm font-medium text-gray-700 mb-1">Pisos declarados</label>
            <input
              type="number" min={1}
              value={building.total_floors}
              onChange={e => setBuilding({ ...building, total_floors: Number(e.target.value) })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
          </div>
          <button
            type="submit" disabled={saving}
            className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
          {message && <span className="text-sm font-medium text-green-600">{message}</span>}
        </form>
        <p className="px-6 pb-4 text-xs text-gray-500">
          "Pisos declarados" es solo informativo (para saber cuántos faltan cargar); los pisos reales del sitio son los de la tabla de abajo.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Pisos</h3>
          <p className="text-sm text-gray-500">Cada piso necesita su plano para que el sitio pueda mostrar los deptos.</p>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-3 text-sm font-semibold text-gray-900 w-24">Número</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Etiqueta</th>
              <th className="px-6 py-3 text-sm font-semibold text-gray-900">Plano (URL)</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {floors.sort((a, b) => a.number - b.number).map(f => (
              <tr key={f.id}>
                <td className="px-6 py-3 text-sm text-gray-600">{f.number}</td>
                <td className="px-6 py-3">
                  <input
                    defaultValue={f.label}
                    onBlur={e => e.target.value !== f.label && handleUpdateFloor(f.id, { label: e.target.value })}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                </td>
                <td className="px-6 py-3 min-w-[280px]">
                  <ImageUploader
                    value={f.plan_image ?? ''}
                    onChange={url => handleUpdateFloor(f.id, { plan_image: url })}
                    folder="floorplans"
                  />
                </td>
                <td className="px-6 py-3 text-right space-x-3 whitespace-nowrap">
                  <Link href={`/admin/edificios/${id}/pisos/${f.id}`} className="text-sm font-medium text-brand-600 hover:text-brand-700">
                    Unidades →
                  </Link>
                  <button onClick={() => handleDeleteFloor(f.id)} className="text-sm text-red-500 hover:text-red-700">Borrar</button>
                </td>
              </tr>
            ))}
            {floors.length === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-gray-400">Todavía no hay pisos cargados.</td></tr>
            )}
          </tbody>
        </table>

        <form onSubmit={handleAddFloor} className="p-6 bg-gray-50/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="number" placeholder="N°"
              value={newFloor.number}
              onChange={e => setNewFloor({ ...newFloor, number: e.target.value })}
              className="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <input
              placeholder="Etiqueta (ej: Planta 1)"
              value={newFloor.label}
              onChange={e => setNewFloor({ ...newFloor, label: e.target.value })}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <button type="submit" className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap">
              + Agregar piso
            </button>
          </div>
          <ImageUploader
            value={newFloor.planImage}
            onChange={url => setNewFloor({ ...newFloor, planImage: url })}
            folder="floorplans"
          />
        </form>
      </div>
    </div>
  );
}
