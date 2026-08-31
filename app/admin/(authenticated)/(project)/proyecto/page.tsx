'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import VideoUploader from '@/components/admin/VideoUploader';
import LocationPicker from '@/components/admin/LocationPicker';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useShareLink } from '@/hooks/useShareLink';
import { getProjectHref, getProjectDisplayUrl } from '@/lib/project-url';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import type {
  ProjectRow as DbProjectRow, BuildingRow as DbBuildingRow, AerialSlideRow, AerialHotspotRow,
} from '@/types/database';
import type { BeforeAfterPair } from '@/types';

type ProjectRow = Pick<DbProjectRow,
  | 'id' | 'slug' | 'name' | 'description' | 'tagline' | 'location' | 'latitude' | 'longitude' | 'masterplan_image'
  | 'academic_institution' | 'academic_career' | 'academic_tutor' | 'academic_year' | 'academic_team'
  | 'process_gallery' | 'before_after'
>;
type BuildingRow = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors'>;
type SlideRow = Pick<AerialSlideRow, 'id' | 'image_url' | 'video_url' | 'label' | 'sort_order'>;
type HotspotRow = Pick<AerialHotspotRow, 'id' | 'slide_id' | 'building_id' | 'x' | 'y'>;

interface CollaboratorRow {
  id: string;
  contribution: string;
  status: 'pending' | 'accepted' | 'declined';
  profile: { handle: string; display_name: string; avatar_image: string | null } | null;
}

interface CommentRow {
  id: string;
  body: string;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null } | null;
}

const COLLABORATOR_STATUS_LABEL: Record<CollaboratorRow['status'], string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  declined: 'Rechazado',
};
const COLLABORATOR_STATUS_CLASS: Record<CollaboratorRow['status'], string> = {
  pending: 'bg-amber-50 text-amber-700',
  accepted: 'bg-green-50 text-green-700',
  declined: 'bg-gray-100 text-gray-500',
};

export default function AdminProjectPage() {
  const typeConfig = useProjectTypeConfig();
  const { saleMode, buildingLabel, hasUnitStep, aerialLabel, aerialLabelPlural } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const aerialLower = aerialLabel.toLowerCase();
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [hotspots, setHotspots] = useState<HotspotRow[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newSlide, setNewSlide] = useState({ imageUrl: '', videoUrl: '', label: '' });
  const [newSlideImageUploading, setNewSlideImageUploading] = useState(false);
  const [newSlideVideoUploading, setNewSlideVideoUploading] = useState(false);
  const [selectedCollaborator, setSelectedCollaborator] = useState<PersonSearchResult | null>(null);
  const [newCollaborator, setNewCollaborator] = useState({ contribution: '' });
  const [collaboratorError, setCollaboratorError] = useState('');
  const [addingCollaborator, setAddingCollaborator] = useState(false);
  const [editingCollaboratorId, setEditingCollaboratorId] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState('');
  const toast = useToast();
  const confirmDialog = useConfirm();
  const shareLink = useShareLink();

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
        setCollaborators(data.collaborators ?? []);
        setComments(data.comments ?? []);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, []);

  // Se completa recién en el cliente para no desalinear el render de
  // servidor — antes de eso mostramos solo la ruta, sin el dominio.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);

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
        tagline: project.tagline,
        location: project.location,
        latitude: project.latitude,
        longitude: project.longitude,
        masterplanImage: project.masterplan_image,
        academicInstitution: project.academic_institution,
        academicCareer: project.academic_career,
        academicTutor: project.academic_tutor,
        academicYear: project.academic_year,
        academicTeam: project.academic_team,
        processGallery: project.process_gallery,
        beforeAfter: project.before_after,
      }),
    });
    setSaving(false);
    if (res.ok) toast('Guardado.'); else toast('Error al guardar.', 'error');
  };

  const handleAddSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSlideImageUploading || newSlideVideoUploading) {
      toast('Esperá a que termine de subir el archivo.', 'error');
      return;
    }
    if (!newSlide.imageUrl || !newSlide.label) {
      toast('Faltan la foto y/o la etiqueta.', 'error');
      return;
    }
    const res = await fetch('/api/admin/aerial-slides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSlide, sortOrder: slides.length }),
    });
    if (res.ok) {
      setNewSlide({ imageUrl: '', videoUrl: '', label: '' });
      load();
    } else {
      toast(`Error al crear la ${aerialLower}.`, 'error');
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
    const ok = await confirmDialog({ message: `¿Borrar esta ${aerialLower} y sus hotspots?`, confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/aerial-slides/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const handleDeleteHotspot = async (id: string) => {
    const res = await fetch(`/api/admin/aerial-hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) load();
  };

  const handleAddCollaborator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCollaborator) return;
    setCollaboratorError('');
    setAddingCollaborator(true);
    const res = await fetch('/api/admin/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: selectedCollaborator.handle, contribution: newCollaborator.contribution }),
    });
    setAddingCollaborator(false);
    if (res.ok) {
      setSelectedCollaborator(null);
      setNewCollaborator({ contribution: '' });
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      setCollaboratorError(data.error ?? 'No se pudo agregar.');
    }
  };

  const handleRemoveCollaborator = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Quitar a esta persona de los créditos del proyecto?', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/collaborators/${id}`, { method: 'DELETE' });
    if (res.ok) load(); else toast('No se pudo quitar.', 'error');
  };

  const startEditingCollaborator = (c: CollaboratorRow) => {
    setEditingCollaboratorId(c.id);
    setEditingContribution(c.contribution);
  };

  const handleSaveCollaboratorEdit = async (id: string) => {
    const res = await fetch(`/api/admin/collaborators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contribution: editingContribution }),
    });
    if (res.ok) {
      setEditingCollaboratorId(null);
      load();
    } else {
      toast('No se pudo guardar.', 'error');
    }
  };

  const handleDeleteComment = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este comentario?', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== id));
    else toast('No se pudo borrar.', 'error');
  };

  // Antes/Después vive en el mismo estado local que el resto de "Proyecto"
  // — se edita acá y se guarda con el mismo botón "Guardar Cambios" de su
  // propia tarjeta, sin ruta API dedicada (igual que la ficha académica).
  const updateBeforeAfterAt = (i: number, updates: Partial<BeforeAfterPair>) => {
    if (!project) return;
    const next = [...project.before_after];
    next[i] = { ...next[i], ...updates };
    setProject({ ...project, before_after: next });
  };
  const removeBeforeAfterAt = (i: number) => {
    if (!project) return;
    setProject({ ...project, before_after: project.before_after.filter((_, idx) => idx !== i) });
  };
  const addBeforeAfterPair = () => {
    if (!project) return;
    setProject({ ...project, before_after: [...project.before_after, { label: '', beforeImage: '', afterImage: '' }] });
  };

  if (loading) return <LoadingSpinner text="Cargando proyecto..." tone="light" />;
  if (loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Proyecto</h2>
          <p className="text-sm text-gray-500 mt-1">Datos generales y {aerialLabelPlural.toLowerCase()} del sitio público.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/admin/proyecto/amenities"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Amenities →
          </Link>
          <Link
            href="/admin/proyecto/ubicacion"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Ubicación →
          </Link>
          <Link
            href="/admin/proyecto/recorrido"
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
          >
            Recorrido de espacios comunes →
          </Link>
        </div>
      </div>

      {/* Link público — lo primero que alguien busca para mandarle el sitio a un cliente */}
      <Card>
        <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Link público de tu proyecto</p>
            <p className="font-mono text-sm text-gray-900 truncate">{origin ? getProjectDisplayUrl(project.slug, origin) : `/proyecto/${project.slug}`}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => shareLink(getProjectDisplayUrl(project.slug, window.location.origin), project.name, `Mirá el proyecto ${project.name}`)}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              Copiar link
            </button>
            <a
              href={getProjectHref(project.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
            >
              Ver sitio ↗
            </a>
          </div>
        </div>
      </Card>

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
            <Input
              label="Bajada del hero (opcional)"
              value={project.tagline ?? ''}
              onChange={e => setProject({ ...project, tagline: e.target.value })}
              placeholder="Ej: 3 dormitorios frente al mar en Punta del Este"
              maxLength={140}
            />
            <p className="text-xs text-gray-400 mt-1">
              Una frase corta debajo del nombre en la portada del sitio — distinta de la descripción larga de más abajo, que solo aparece al scrollear.
            </p>
          </div>

          <LocationPicker
            label="Centro del mapa de Ubicación"
            latitude={project.latitude}
            longitude={project.longitude}
            onChange={(lat, lng) => setProject({ ...project, latitude: lat, longitude: lng })}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {saleMode === 'showcase' ? 'Memoria del proyecto' : 'Descripción'}
            </label>
            {saleMode === 'showcase' && (
              <p className="text-xs text-gray-400 mb-2">Concepto, partido, referencias — el texto que explica el proyecto, no solo lo que se ve en las imágenes. Dejá una línea en blanco entre párrafos.</p>
            )}
            <textarea
              value={project.description ?? ''}
              onChange={e => setProject({ ...project, description: e.target.value })}
              rows={saleMode === 'showcase' ? 10 : 3}
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


      {/* Colaboradores — créditos públicos, no acceso al admin */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Colaboradores</h3>
          <p className="text-sm text-gray-500">Acreditá a quien trabajó en este proyecto por su handle de portfolio. El crédito queda pendiente hasta que esa persona lo confirma, y recién ahí aparece en la ficha del proyecto y en su propio portfolio.</p>
        </CardHeader>
        {project.academic_team && (
          <p className="px-6 py-3 text-sm text-amber-700 bg-amber-50 border-b border-amber-100">
            Antes tenías cargado como texto libre: <span className="font-medium">&ldquo;{project.academic_team}&rdquo;</span>. Ese campo se sacó porque quedaba duplicado con esto — agregalos acá abajo como colaboradores reales para que puedan confirmarlo y les quede en su portfolio.
          </p>
        )}
        <div className="divide-y divide-gray-100">
          {collaborators.map(c => (
            <div key={c.id} className="p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                {c.profile?.avatar_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.profile.avatar_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm text-gray-400">{(c.profile?.display_name ?? '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 truncate">{c.profile?.display_name ?? c.profile?.handle ?? '(perfil borrado)'}</p>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${COLLABORATOR_STATUS_CLASS[c.status]}`}>
                    {COLLABORATOR_STATUS_LABEL[c.status]}
                  </span>
                </div>
                {editingCollaboratorId === c.id ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      value={editingContribution}
                      onChange={e => setEditingContribution(e.target.value)}
                      className="flex-1 px-2.5 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                      autoFocus
                    />
                    <button onClick={() => handleSaveCollaboratorEdit(c.id)} className="text-xs font-medium text-brand-600 hover:text-brand-700 shrink-0">Guardar</button>
                    <button onClick={() => setEditingCollaboratorId(null)} className="text-xs text-gray-400 hover:text-gray-600 shrink-0">Cancelar</button>
                  </div>
                ) : (
                  c.contribution && <p className="text-sm text-gray-500 truncate">{c.contribution}</p>
                )}
                {c.status === 'accepted' && editingCollaboratorId !== c.id && (
                  <p className="text-xs text-gray-400 mt-0.5">Si editás lo que hizo, vuelve a pedirle confirmación.</p>
                )}
              </div>
              {editingCollaboratorId !== c.id && (
                <div className="flex items-center gap-3 shrink-0">
                  <button onClick={() => startEditingCollaborator(c)} className="text-sm text-gray-500 hover:text-gray-700">
                    Editar
                  </button>
                  <button onClick={() => handleRemoveCollaborator(c.id)} className="text-sm text-red-500 hover:text-red-700">
                    Quitar
                  </button>
                </div>
              )}
            </div>
          ))}
          {collaborators.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">Todavía no acreditaste a nadie en este proyecto.</p>
          )}
        </div>
        <form onSubmit={handleAddCollaborator} className="p-6 bg-gray-50/50 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PersonSearchSelect
              selected={selectedCollaborator}
              onSelect={setSelectedCollaborator}
              onClear={() => setSelectedCollaborator(null)}
              placeholder="Buscar por nombre o handle..."
            />
            <Input
              value={newCollaborator.contribution}
              onChange={e => setNewCollaborator({ ...newCollaborator, contribution: e.target.value })}
              placeholder="Qué hizo (ej: Renders y maqueta)"
              aria-label="Qué hizo en el proyecto"
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            {collaboratorError && <p className="text-sm text-red-500">{collaboratorError}</p>}
            <Button type="submit" disabled={addingCollaborator || !selectedCollaborator} className="ml-auto">
              {addingCollaborator ? 'Agregando...' : '+ Acreditar'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Comentarios — moderación desde el admin, se publican desde la ficha pública */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Comentarios</h3>
          <p className="text-sm text-gray-500">Lo que dejan los visitantes en la ficha pública del proyecto. Podés borrar cualquiera.</p>
        </CardHeader>
        <div className="divide-y divide-gray-100">
          {comments.map(c => (
            <div key={c.id} className="p-4 flex items-start gap-4">
              <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                {c.author?.avatar_image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.author.avatar_image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm text-gray-400">{(c.author?.display_name ?? 'U').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm">{c.author?.display_name ?? 'Usuario'}</p>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-line">{c.body}</p>
              </div>
              <button onClick={() => handleDeleteComment(c.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">
                Borrar
              </button>
            </div>
          ))}
          {comments.length === 0 && (
            <p className="p-6 text-sm text-gray-400 text-center">Todavía no hay comentarios en este proyecto.</p>
          )}
        </div>
      </Card>

      {/* Ficha académica — solo tiene sentido en proyectos showcase */}
      {saleMode === 'showcase' && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">Ficha académica</h3>
            <p className="text-sm text-gray-500">Contexto del trabajo — se muestra junto a la memoria en el sitio público.</p>
          </CardHeader>
          <form onSubmit={handleSaveProject} className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <Input
              label="Institución / Universidad"
              value={project.academic_institution ?? ''}
              onChange={e => setProject({ ...project, academic_institution: e.target.value })}
              placeholder="Universidad de Buenos Aires"
            />
            <Input
              label="Carrera"
              value={project.academic_career ?? ''}
              onChange={e => setProject({ ...project, academic_career: e.target.value })}
              placeholder="Arquitectura"
            />
            <Input
              label="Cátedra / Tutor"
              value={project.academic_tutor ?? ''}
              onChange={e => setProject({ ...project, academic_tutor: e.target.value })}
              placeholder="Cátedra Pérez"
            />
            <Input
              label="Año"
              value={project.academic_year ?? ''}
              onChange={e => setProject({ ...project, academic_year: e.target.value })}
              placeholder="2025"
            />
            <div className="sm:col-span-2 pt-2 border-t border-gray-100 flex items-center justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Galería de proceso — bocetos, maquetas, diagramas, aparte de las fotos finales */}
      {saleMode === 'showcase' && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">Galería de proceso</h3>
            <p className="text-sm text-gray-500">Bocetos, maquetas, diagramas de programa o estructura — el proceso detrás del proyecto, aparte de las fotos finales.</p>
          </CardHeader>
          <form onSubmit={handleSaveProject} className="p-6 space-y-4">
            <MultiImageUploader
              values={project.process_gallery}
              onChange={urls => setProject({ ...project, process_gallery: urls })}
              folder="process"
            />
            <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Antes / Después — para reciclaje o rehabilitación */}
      {saleMode === 'showcase' && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">Antes / Después</h3>
            <p className="text-sm text-gray-500">Para un reciclaje o una rehabilitación — cada par se muestra con un slider comparador en el sitio público.</p>
          </CardHeader>
          <div className="divide-y divide-gray-100">
            {project.before_after.map((pair, i) => (
              <div key={i} className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <Input
                      label="Etiqueta"
                      value={pair.label}
                      onChange={e => updateBeforeAfterAt(i, { label: e.target.value })}
                      placeholder="Fachada, Interior, Patio..."
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeBeforeAfterAt(i)}
                    className="text-sm text-red-500 hover:text-red-700 mt-6 shrink-0"
                  >
                    Borrar
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ImageUploader
                    label="Antes"
                    value={pair.beforeImage}
                    onChange={url => updateBeforeAfterAt(i, { beforeImage: url })}
                    folder="before-after"
                  />
                  <ImageUploader
                    label="Después"
                    value={pair.afterImage}
                    onChange={url => updateBeforeAfterAt(i, { afterImage: url })}
                    folder="before-after"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="p-6 bg-gray-50/50 flex items-center justify-between gap-3">
            <button type="button" onClick={addBeforeAfterPair} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              + Agregar comparación
            </button>
            <Button onClick={handleSaveProject} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </Button>
          </div>
        </Card>
      )}

      {/* Vistas aéreas / Vista frontal */}
      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">{aerialLabelPlural}</h3>
          <p className="text-sm text-gray-500">
            {!hasUnitStep
              ? `La foto del frente de la ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
              : typeConfig.singleBuilding
              ? `La vista aérea ${agree.del} ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
              : `Lo primero que ve el visitante al entrar al masterplan, con los hotspots de cada ${buildingLabelLower}.`}
          </p>
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
                    {hasUnitStep ? 'Delimitar torres →' : 'Marcar la casa →'}
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
                      <span className="text-gray-700 font-medium w-32 truncate">{b?.name ?? `(${buildingLabelLower} borrado)`}</span>
                      <span className="text-gray-500">x: {h.x}%, y: {h.y}%</span>
                      <button onClick={() => handleDeleteHotspot(h.id)} className="text-gray-400 hover:text-red-500 ml-auto">×</button>
                    </div>
                  );
                })}
                <p className="text-xs text-gray-400">
                  Para agregar o mover un hotspot, usá{' '}
                  <Link href={`/admin/proyecto/aereas/${slide.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                    {hasUnitStep ? 'Delimitar torres →' : 'Marcar la casa →'}
                  </Link>{' '}
                  y ubicalo con un clic directo sobre la foto.
                </p>
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
                placeholder={hasUnitStep ? "Etiqueta (ej: Vista Norte)" : "Etiqueta (ej: Frente)"}
                aria-label={`Etiqueta de la ${aerialLower}`}
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto" disabled={newSlideImageUploading || newSlideVideoUploading}>
              {newSlideImageUploading || newSlideVideoUploading ? 'Subiendo...' : `+ Agregar ${aerialLower}`}
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ImageUploader
              label="Foto (poster / respaldo)"
              value={newSlide.imageUrl}
              onChange={url => setNewSlide({ ...newSlide, imageUrl: url })}
              onUploadingChange={setNewSlideImageUploading}
              folder="aerial"
            />
            <VideoUploader
              label="Video (opcional)"
              value={newSlide.videoUrl}
              onChange={url => setNewSlide({ ...newSlide, videoUrl: url })}
              onUploadingChange={setNewSlideVideoUploading}
              folder="aerial"
            />
          </div>
        </form>
      </Card>
    </div>
  );
}
