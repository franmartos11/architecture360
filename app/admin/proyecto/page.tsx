'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import VideoUploader from '@/components/admin/VideoUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  masterplan_image: string | null;
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
  video_url: string | null;
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSlide, setNewSlide] = useState({ imageUrl: '', videoUrl: '', label: '' });
  const toast = useToast();
  const [newHotspot, setNewHotspot] = useState<Record<string, { buildingId: string; x: string; y: string }>>({});

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setProject(data.project);
        setBuildings(data.buildings);
        setSlides(data.slides);
        setHotspots(data.hotspots);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

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
      }),
    });
    setSaving(false);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
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
      setNewSlide({ imageUrl: '', videoUrl: '', label: '' });
      load();
    } else {
      toast('Error al crear la vista aérea.', 'error');
    }
  };

  const handleUpdateSlide = async (id: string, updates: { imageUrl?: string; videoUrl?: string }) => {
    setSlides(prev => prev.map(s => (
      s.id === id
        ? { ...s, ...(updates.imageUrl !== undefined ? { image_url: updates.imageUrl } : {}), ...(updates.videoUrl !== undefined ? { video_url: updates.videoUrl || null } : {}) }
        : s
    )));
    const res = await fetch(`/api/admin/aerial-slides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
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
      toast('Error al crear el hotspot.', 'error');
    }
  };

  const handleDeleteHotspot = async (id: string) => {
    const res = await fetch(`/api/admin/aerial-hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  if (loading) return <LoadingSpinner text="Cargando proyecto..." tone="light" />;
  if (loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Proyecto</h2>
          <p className="text-sm text-gray-500 mt-1">Datos generales y vistas aéreas del sitio público.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/proyecto/amenities"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Amenities →
          </Link>
          <Link
            href="/admin/proyecto/recorrido"
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Recorrido de áreas comunes →
          </Link>
        </div>
      </div>

      {/* Datos generales */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-gray-900">Datos generales</h3>
        </CardHeader>
        <form onSubmit={handleSaveProject} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input
              label="Nombre"
              value={project.name}
              onChange={e => setProject({ ...project, name: e.target.value })}
              required
            />
            <Input
              label="Ubicación"
              value={project.location ?? ''}
              onChange={e => setProject({ ...project, location: e.target.value })}
            />
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

          <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
            <Button type="submit" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Vistas aéreas */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Vistas aéreas</h3>
          <p className="text-sm text-gray-500">El carrusel que ve el visitante al entrar al proyecto, con los hotspots de cada edificio.</p>
        </CardHeader>

        <div className="divide-y divide-gray-100">
          {slides.map(slide => (
            <div key={slide.id} className="p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <p className="font-medium text-gray-900">{slide.label}</p>
                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/admin/proyecto/aereas/${slide.id}`}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Delimitar torres →
                  </Link>
                  <button
                    onClick={() => handleDeleteSlide(slide.id)}
                    className="text-sm text-red-500 hover:text-red-700"
                  >
                    Borrar vista
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ImageUploader
                  label="Foto (poster / respaldo)"
                  value={slide.image_url}
                  onChange={url => handleUpdateSlide(slide.id, { imageUrl: url })}
                  folder="aerial"
                />
                <VideoUploader
                  label="Video (opcional — reemplaza la foto si está)"
                  value={slide.video_url ?? ''}
                  onChange={url => handleUpdateSlide(slide.id, { videoUrl: url })}
                  folder="aerial"
                />
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
            <div className="flex-1">
              <Input
                value={newSlide.label}
                onChange={e => setNewSlide({ ...newSlide, label: e.target.value })}
                placeholder="Etiqueta (ej: Vista Norte)"
                aria-label="Etiqueta de la vista aérea"
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto">
              + Agregar vista
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploader
              label="Foto (poster / respaldo)"
              value={newSlide.imageUrl}
              onChange={url => setNewSlide({ ...newSlide, imageUrl: url })}
              folder="aerial"
            />
            <VideoUploader
              label="Video (opcional)"
              value={newSlide.videoUrl}
              onChange={url => setNewSlide({ ...newSlide, videoUrl: url })}
              folder="aerial"
            />
          </div>
        </form>
      </Card>
    </div>
  );
}
