'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  masterplan_image: string | null;
  amenities: string[] | null;
}
interface BuildingRow {
  id: string;
  slug: string;
  name: string;
  total_floors: number;
}
interface SlideRow {
  id: string;
  image_url: string;
  label: string;
  sort_order: number;
}
interface HotspotRow {
  id: string;
  slide_id: string;
  building_id: string;
  x: number;
  y: number;
}

export default function AdminProjectPage() {
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [hotspots, setHotspots] = useState<HotspotRow[]>([]);
  const [amenityDraft, setAmenityDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [newSlide, setNewSlide] = useState({ imageUrl: '', label: '' });
  const [newHotspot, setNewHotspot] = useState<Record<string, { buildingId: string; x: string; y: string }>>({});

  const load = () => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setProject(data.project);
        setBuildings(data.buildings);
        setSlides(data.slides);
        setHotspots(data.hotspots);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project) return;
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: project.name,
        description: project.description,
        location: project.location,
        masterplanImage: project.masterplan_image,
        amenities: project.amenities ?? [],
      }),
    });
    setSaving(false);
    flash(res.ok ? 'Guardado.' : 'Error al guardar.');
  };

  const addAmenity = () => {
    if (!project || !amenityDraft.trim()) return;
    setProject({ ...project, amenities: [...(project.amenities ?? []), amenityDraft.trim()] });
    setAmenityDraft('');
  };
  const removeAmenity = (i: number) => {
    if (!project) return;
    setProject({ ...project, amenities: (project.amenities ?? []).filter((_, idx) => idx !== i) });
  };

  const handleAddSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSlide.imageUrl || !newSlide.label) return;
    const res = await fetch('/api/admin/aerial-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSlide, sortOrder: slides.length }),
    });
    if (res.ok) {
      setNewSlide({ imageUrl: '', label: '' });
      load();
    } else {
      flash('Error al crear la vista aérea.');
    }
  };

  const handleDeleteSlide = async (id: string) => {
    if (!confirm('¿Borrar esta vista aérea y sus hotspots?')) return;
    const res = await fetch(`/api/admin/aerial-slides/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const handleAddHotspot = async (slideId: string) => {
    const draft = newHotspot[slideId];
    if (!draft?.buildingId || draft.x === '' || draft.y === '') return;
    const res = await fetch('/api/admin/aerial-hotspots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slideId, buildingId: draft.buildingId, x: Number(draft.x), y: Number(draft.y) }),
    });
    if (res.ok) {
      setNewHotspot({ ...newHotspot, [slideId]: { buildingId: '', x: '', y: '' } });
      load();
    } else {
      flash('Error al crear el hotspot.');
    }
  };

  const handleDeleteHotspot = async (id: string) => {
    const res = await fetch(`/api/admin/aerial-hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  if (loading || !project) return <div className="text-gray-500">Cargando proyecto...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Proyecto</h2>
          <p className="text-sm text-gray-500 mt-1">Datos generales y vistas aéreas del sitio público.</p>
        </div>
        <Link
          href="/admin/proyecto/recorrido"
          className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
        >
          Recorrido de áreas comunes →
        </Link>
      </div>

      {/* Datos generales */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Datos generales</h3>
        </div>
        <form onSubmit={handleSaveProject} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nombre</label>
              <input
                value={project.name}
                onChange={e => setProject({ ...project, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Ubicación</label>
              <input
                value={project.location ?? ''}
                onChange={e => setProject({ ...project, location: e.target.value })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción</label>
            <textarea
              value={project.description ?? ''}
              onChange={e => setProject({ ...project, description: e.target.value })}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
            />
          </div>

          <ImageUploader
            label="Imagen del masterplan"
            value={project.masterplan_image ?? ''}
            onChange={url => setProject({ ...project, masterplan_image: url })}
            folder="masterplan"
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amenities</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(project.amenities ?? []).map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 text-sm px-3 py-1 rounded-full">
                  {a}
                  <button type="button" onClick={() => removeAmenity(i)} className="text-gray-400 hover:text-red-500">×</button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={amenityDraft}
                onChange={e => setAmenityDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAmenity(); } }}
                placeholder="Ej: Piscina infinita"
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              />
              <button type="button" onClick={addAmenity} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-colors">
                Agregar
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-green-600">{message}</span>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>

      {/* Vistas aéreas */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Vistas aéreas</h3>
          <p className="text-sm text-gray-500">El carrusel que ve el visitante al entrar al proyecto, con los hotspots de cada edificio.</p>
        </div>

        <div className="divide-y divide-gray-100">
          {slides.map(slide => (
            <div key={slide.id} className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium text-gray-900">{slide.label}</p>
                  <p className="text-xs text-gray-500 break-all">{slide.image_url}</p>
                </div>
                <button
                  onClick={() => handleDeleteSlide(slide.id)}
                  className="text-sm text-red-500 hover:text-red-700 shrink-0"
                >
                  Borrar vista
                </button>
              </div>

              {/* Hotspots de este slide */}
              <div className="pl-4 border-l-2 border-gray-100 space-y-2">
                {hotspots.filter(h => h.slide_id === slide.id).map(h => {
                  const b = buildings.find(bb => bb.id === h.building_id);
                  return (
                    <div key={h.id} className="flex items-center gap-3 text-sm">
                      <span className="text-gray-700 font-medium w-32 truncate">{b?.name ?? '(edificio borrado)'}</span>
                      <span className="text-gray-500">x: {h.x}%, y: {h.y}%</span>
                      <button onClick={() => handleDeleteHotspot(h.id)} className="text-gray-400 hover:text-red-500 ml-auto">×</button>
                    </div>
                  );
                })}

                <div className="flex items-center gap-2 pt-1">
                  <select
                    value={newHotspot[slide.id]?.buildingId ?? ''}
                    onChange={e => setNewHotspot({ ...newHotspot, [slide.id]: { ...(newHotspot[slide.id] ?? { x: '', y: '' }), buildingId: e.target.value } })}
                    className="text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                  >
                    <option value="">Edificio...</option>
                    {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <input
                    type="number" placeholder="x %"
                    value={newHotspot[slide.id]?.x ?? ''}
                    onChange={e => setNewHotspot({ ...newHotspot, [slide.id]: { ...(newHotspot[slide.id] ?? { buildingId: '', y: '' }), x: e.target.value } })}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                  <input
                    type="number" placeholder="y %"
                    value={newHotspot[slide.id]?.y ?? ''}
                    onChange={e => setNewHotspot({ ...newHotspot, [slide.id]: { ...(newHotspot[slide.id] ?? { buildingId: '', x: '' }), y: e.target.value } })}
                    className="w-20 text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-500 outline-none"
                  />
                  <button
                    onClick={() => handleAddHotspot(slide.id)}
                    className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
                  >
                    + Hotspot
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddSlide} className="p-6 bg-gray-50/50 space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              value={newSlide.label}
              onChange={e => setNewSlide({ ...newSlide, label: e.target.value })}
              placeholder="Etiqueta (ej: Vista Norte)"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
            />
            <button type="submit" className="px-6 py-2 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap">
              + Agregar vista
            </button>
          </div>
          <ImageUploader
            value={newSlide.imageUrl}
            onChange={url => setNewSlide({ ...newSlide, imageUrl: url })}
            folder="aerial"
          />
        </form>
      </div>
    </div>
  );
}
