'use client';

import { useState, useEffect, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import VideoUploader from '@/components/admin/VideoUploader';
import LocationPicker from '@/components/admin/LocationPicker';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { PageHeader, SectionRow, Pill, btnPrimary, btnSecondary, fieldClass } from '@/components/admin/panel-ui';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useShareLink } from '@/hooks/useShareLink';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { getProjectDisplayUrl } from '@/lib/project-url';
import { usePublishState } from '@/lib/publish-state-context';
import PublishCallout from '@/components/admin/PublishCallout';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import type {
  ProjectRow as DbProjectRow, BuildingRow as DbBuildingRow, AerialSlideRow, AerialHotspotRow,
} from '@/types/database';
import type { BeforeAfterPair } from '@/types';

import { pluralize } from '@/lib/units';
type ProjectRow = Pick<DbProjectRow,
  | 'id' | 'slug' | 'name' | 'description' | 'tagline' | 'location' | 'latitude' | 'longitude' | 'masterplan_image'
  | 'academic_institution' | 'academic_career' | 'academic_tutor' | 'academic_year' | 'academic_team'
  | 'process_gallery' | 'before_after' | 'published'
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

export default function AdminProjectPage() {
  const typeConfig = useProjectTypeConfig();
  const { saleMode, buildingLabel, hasUnitStep, aerialLabel, aerialLabelPlural } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const aerialLower = aerialLabel.toLowerCase();
  const [project, setProject] = useState<ProjectRow | null>(null);
  // Snapshot de lo último guardado — compararlo contra `project` es lo que
  // arma la barra flotante de "cambios sin guardar" (reemplaza los 4
  // botones "Guardar Cambios" sueltos que tenían Datos generales, Ficha
  // académica, Galería de proceso y Antes/Después: los 4 pegaban al mismo
  // PATCH sobre el mismo objeto `project`).
  const [savedProject, setSavedProject] = useState<ProjectRow | null>(null);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [slides, setSlides] = useState<SlideRow[]>([]);
  const [hotspots, setHotspots] = useState<HotspotRow[]>([]);
  const [collaborators, setCollaborators] = useState<CollaboratorRow[]>([]);
  const [comments, setComments] = useState<CommentRow[]>([]);
  // Cuántas unidades tienen precio — alimenta el ítem "Precios cargados" del checklist.
  const [unitPrices, setUnitPrices] = useState({ total: 0, priced: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [expandedSlideId, setExpandedSlideId] = useState<string | null>(null);
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
  const activeProjectId = useActiveProjectId();
  const confirmDialog = useConfirm();
  const shareLink = useShareLink();
  const publishState = usePublishState();

  const load = () => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => {
        setProject(data.project);
        setSavedProject(data.project);
        setBuildings(data.buildings);
        setSlides(data.slides);
        setHotspots(data.hotspots);
        setCollaborators(data.collaborators ?? []);
        setComments(data.comments ?? []);
        setUnitPrices(data.unitPrices ?? { total: 0, priced: 0 });
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  };

  useEffect(load, [activeProjectId]);

  // Se completa recién en el cliente para no desalinear el render de
  // servidor — antes de eso mostramos solo la ruta, sin el dominio.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    startTransition(() => setOrigin(window.location.origin));
  }, []);

  const handleSaveProject = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!project) return;
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
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
    if (res.ok) {
      setSavedProject(project);
      publishState.refresh();
      toast('Guardado.');
    } else {
      toast('Error al guardar.', 'error');
    }
  };

  const discardChanges = () => { if (savedProject) setProject(savedProject); };

  // Mismo estado que el sidebar (lib/publish-state-context): publicar acá
  // se refleja allá al instante, y el server valida el mínimo igual.
  const handleTogglePublished = async () => {
    if (!project) return;
    if (!publishState.published && dirty) {
      toast('Guardá los cambios antes de publicar.', 'error');
      return;
    }
    const published = !publishState.published;
    setPublishing(true);
    const r = await publishState.setPublished(published);
    setPublishing(false);
    if (r.ok) {
      setProject({ ...project, published });
      setSavedProject(prev => prev ? { ...prev, published } : prev);
      toast(published ? '¡Sitio publicado! Ya está en línea.' : 'Sitio despublicado: volvió a borrador.');
    } else {
      toast(r.error ?? 'No se pudo cambiar la visibilidad del proyecto.', 'error');
    }
  };

  const handleCopyLink = () => {
    if (!project) return;
    navigator.clipboard.writeText(getProjectDisplayUrl(project.slug, origin || window.location.origin));
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
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
    const res = await fetch(withActiveProject('/api/admin/aerial-slides', activeProjectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSlide, sortOrder: slides.length }),
    });
    if (res.ok) {
      setNewSlide({ imageUrl: '', videoUrl: '', label: '' });
      load();
      publishState.refresh();
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
    if (res.ok) { load(); publishState.refresh(); }
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
    const res = await fetch(withActiveProject('/api/admin/collaborators', activeProjectId), {
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

  const dirty = !!(project && savedProject && JSON.stringify(project) !== JSON.stringify(savedProject));

  // Checklist RECOMENDADO (no bloquea publicar; lo obligatorio está en
  // lib/publish-readiness) — distinto de useProjectCompleteness
  // (esa mide secciones vacías de la landing tipo Amenities/Ubicación).
  // Acá se mira lo que esta misma pantalla carga. Hotspots solo aplica
  // cuando hay varios buildings de verdad para delimitar (no en casa/loteo,
  // que son singleBuilding).
  const checklistItems: { label: string; ok: boolean }[] = project ? [
    { label: 'Nombre', ok: !!project.name.trim() },
    { label: 'Bajada', ok: (project.tagline ?? '').trim().length > 8 },
    { label: 'Descripción', ok: (project.description ?? '').trim().length > 40 },
    { label: aerialLabel, ok: slides.length > 0 },
    ...(hasUnitStep && !typeConfig.singleBuilding
      ? [{ label: 'Hotspots', ok: hotspots.length > 0 }]
      : []),
    { label: 'Ubicación', ok: project.latitude != null && project.longitude != null },
    ...(saleMode === 'venta' ? [{
      // Con unidades cargadas pero sin precio en todas, se muestra cuántas faltan.
      label: unitPrices.total > 0 && unitPrices.priced < unitPrices.total
        ? `Precios cargados (${unitPrices.priced}/${unitPrices.total})`
        : 'Precios cargados',
      ok: unitPrices.total > 0 && unitPrices.priced === unitPrices.total,
    }] : []),
  ] : [];
  const checklistOk = checklistItems.filter(i => i.ok).length;
  const checklistPct = checklistItems.length ? Math.round((checklistOk / checklistItems.length) * 100) : 0;
  const checklistMissing = checklistItems.filter(i => !i.ok).map(i => i.label);

  if (loading) return <LoadingSpinner text="Cargando proyecto..." tone="light" />;
  if (loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={load} />;

  const displayUrl = origin ? getProjectDisplayUrl(project.slug, origin) : `/proyecto/${project.slug}`;
  const textareaClass = `${fieldClass} py-3 leading-relaxed resize-y`;
  const chapterLinks = [
    { label: 'Amenidades', href: '/admin/proyecto/amenities' },
    { label: 'Ubicación', href: '/admin/proyecto/ubicacion' },
    { label: 'Avance de obra', href: '/admin/proyecto/avance' },
    { label: 'Recorrido 360°', href: '/admin/proyecto/recorrido' },
    { label: 'Modelo BIM', href: '/admin/proyecto/bim' },
  ];

  // Layout del diseño "Ficha · Esencial": columna de formulario por
  // secciones (título a la izquierda, campos a la derecha) y "Vista en vivo"
  // a la derecha. Anula el padding del shell para ocupar todo el alto.
  return (
    <div className="-m-6 md:-m-8 flex flex-wrap items-stretch min-h-screen">
      <div className="flex-[999_1_600px] min-w-0 px-4 py-8 sm:px-10 sm:py-10">
        <div className="max-w-[760px] mx-auto flex flex-col gap-7">
          <PageHeader
            eyebrow={`Ficha del proyecto · ${publishState.published ? 'Publicado' : 'Borrador'}`}
            title="Esencial"
            description={`Lo primero que ve ${saleMode === 'venta' ? 'un comprador' : 'quien visita el proyecto'}. Con esto completo el sitio ya se puede publicar; todo lo demás suma, pero no bloquea.`}
          />

          <nav aria-label="Más de la ficha" className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500 mr-1">También en la ficha:</span>
            {chapterLinks.map(l => (
              <Link key={l.href} href={l.href} className="min-h-[36px] px-3 flex items-center rounded-full border border-gray-200 bg-white text-[13px] text-gray-900 hover:border-gray-300">
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => shareLink(getProjectDisplayUrl(project.slug, window.location.origin), project.name, `Mirá el proyecto ${project.name}`)}
              className="min-h-[36px] px-3 flex items-center rounded-full border border-gray-200 bg-white text-[13px] text-gray-900 hover:border-gray-300"
            >
              Compartir
            </button>
          </nav>

          {/* Lo OBLIGATORIO para publicar (y el botón) vive en PublishCallout,
              compartido con el sidebar y el dashboard. */}
          <PublishCallout />

          <form onSubmit={handleSaveProject} className="flex flex-col gap-7">
            <SectionRow title="Identidad" description="Nombre y ubicación tal como aparecen en el sitio y al compartir el link." first>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Nombre del proyecto</span>
                <input value={project.name} onChange={e => setProject({ ...project, name: e.target.value })} required className={`${fieldClass} text-[15px]`} />
              </label>
              <div className="grid gap-3.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-700">Ciudad o zona</span>
                  <input value={project.location ?? ''} onChange={e => setProject({ ...project, location: e.target.value })} placeholder="Ej: Punta del Este, Uruguay" className={fieldClass} />
                </label>
                <div className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-xs font-medium text-gray-700">Dirección pública</span>
                  <div className="flex items-stretch min-h-[44px] rounded-[10px] border border-gray-300 bg-white overflow-hidden">
                    <span className="flex-1 min-w-0 px-3 flex items-center font-mono text-xs text-gray-700 bg-gray-100 truncate" title={displayUrl}>{displayUrl}</span>
                    <button type="button" onClick={handleCopyLink} className="px-3.5 border-l border-gray-300 text-[13px] font-semibold text-gray-900 hover:bg-gray-50 shrink-0">
                      {copied ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              </div>
            </SectionRow>

            <SectionRow
              title="Portada"
              description="Una imagen fuerte y una frase. Es lo único que se ve antes de hacer scroll."
              badge={!project.masterplan_image ? <Pill tone="warn">Requerido para publicar</Pill> : undefined}
            >
              <ImageUploader
                label="Imagen principal"
                value={project.masterplan_image ?? ''}
                onChange={url => setProject({ ...project, masterplan_image: url })}
                folder="masterplan"
              />
              <label className="flex flex-col gap-1.5">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-medium text-gray-700">Bajada de portada</span>
                  <span className={`text-xs ${(project.tagline ?? '').length > 90 ? 'text-red-600' : 'text-gray-500'}`}>{(project.tagline ?? '').length} / 90</span>
                </span>
                <textarea
                  value={project.tagline ?? ''}
                  onChange={e => setProject({ ...project, tagline: e.target.value })}
                  placeholder="Ej: 3 dormitorios frente al mar en Punta del Este"
                  maxLength={140}
                  rows={2}
                  className={`${textareaClass} text-[15px]`}
                />
                <span className="text-xs text-gray-500">Una línea, lo primero que se lee. Se ve en la vista en vivo mientras escribís.</span>
              </label>
            </SectionRow>

            <SectionRow
              title={saleMode === 'showcase' ? 'Memoria del proyecto' : 'Relato'}
              description={saleMode === 'showcase'
                ? 'Concepto, partido, referencias — el texto que explica el proyecto. Dejá una línea en blanco entre párrafos.'
                : 'Por qué este proyecto y no otro. Entre 60 y 120 palabras funciona mejor.'}
            >
              <div className="rounded-xl border border-gray-300 bg-white overflow-hidden focus-within:border-brand-700 focus-within:ring-2 focus-within:ring-brand-500/30">
                <textarea
                  aria-label={saleMode === 'showcase' ? 'Memoria del proyecto' : 'Descripción'}
                  value={project.description ?? ''}
                  onChange={e => setProject({ ...project, description: e.target.value })}
                  rows={saleMode === 'showcase' ? 10 : 5}
                  className="block w-full px-4 py-3.5 text-[15px] leading-[1.7] text-gray-900 outline-none resize-y border-0"
                />
                <div className="flex justify-between px-3.5 py-2 border-t border-gray-100 text-xs text-gray-500">
                  <span>{(project.description ?? '').trim().split(/\s+/).filter(Boolean).length} palabras</span>
                  <span className={(project.description ?? '').length > 600 ? 'text-red-600' : ''}>{(project.description ?? '').length} / 600</span>
                </div>
              </div>
            </SectionRow>

            <SectionRow title="Ubicación en el mapa" description="El centro del mapa de la sección Ubicación. Los lugares cercanos se cargan en Ubicación.">
              <LocationPicker
                label="Centro del mapa"
                latitude={project.latitude}
                longitude={project.longitude}
                onChange={(lat, lng) => setProject({ ...project, latitude: lat, longitude: lng })}
              />
            </SectionRow>

            {saleMode === 'showcase' && (
              <SectionRow title="Ficha académica" description="Contexto del trabajo — se muestra junto a la memoria en el sitio público.">
                <div className="grid gap-3.5 sm:grid-cols-2">
                  {([
                    ['Institución / Universidad', 'academic_institution', 'Universidad de Buenos Aires'],
                    ['Carrera', 'academic_career', 'Arquitectura'],
                    ['Cátedra / Tutor', 'academic_tutor', 'Cátedra Pérez'],
                    ['Año', 'academic_year', '2025'],
                  ] as const).map(([label, key, ph]) => (
                    <label key={key} className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-700">{label}</span>
                      <input value={project[key] ?? ''} onChange={e => setProject({ ...project, [key]: e.target.value })} placeholder={ph} className={fieldClass} />
                    </label>
                  ))}
                </div>
              </SectionRow>
            )}

            {saleMode === 'showcase' && (
              <SectionRow title="Galería de proceso" description="Bocetos, maquetas, diagramas — el proceso detrás del proyecto, aparte de las fotos finales.">
                <MultiImageUploader
                  values={project.process_gallery}
                  onChange={urls => setProject({ ...project, process_gallery: urls })}
                  folder="process"
                />
              </SectionRow>
            )}

            {saleMode === 'showcase' && (
              <SectionRow title="Antes / Después" description="Para un reciclaje o una rehabilitación — cada par se muestra con un slider comparador.">
                {project.before_after.map((pair, i) => (
                  <div key={i} className="p-4 rounded-2xl border border-gray-200 bg-white flex flex-col gap-3.5">
                    <div className="flex items-end gap-3">
                      <label className="flex-1 flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-700">Etiqueta</span>
                        <input value={pair.label} onChange={e => updateBeforeAfterAt(i, { label: e.target.value })} placeholder="Fachada, Interior, Patio..." className={fieldClass} />
                      </label>
                      <button type="button" onClick={() => removeBeforeAfterAt(i)} className="min-h-[44px] px-3 text-[13px] font-medium text-red-700 hover:bg-red-50 rounded-lg shrink-0">Borrar</button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <ImageUploader label="Antes" value={pair.beforeImage} onChange={url => updateBeforeAfterAt(i, { beforeImage: url })} folder="before-after" />
                      <ImageUploader label="Después" value={pair.afterImage} onChange={url => updateBeforeAfterAt(i, { afterImage: url })} folder="before-after" />
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addBeforeAfterPair} className="self-start min-h-[40px] text-[13px] font-semibold text-brand-700">+ Agregar comparación</button>
              </SectionRow>
            )}
          </form>

          {/* Vistas aéreas / Vista frontal — la entrada al masterplan. El
              detalle fino (hotspots) sigue en /admin/proyecto/aereas/[id]. */}
          <section className="flex flex-col gap-4 pt-7 border-t border-gray-200">
            <div className="flex flex-col gap-1.5 max-w-[560px]">
              <h2 className="m-0 text-[15px] font-semibold text-gray-900">{aerialLabelPlural}</h2>
              <p className="m-0 text-[13px] leading-relaxed text-gray-600">{!hasUnitStep
              ? `La foto del frente de la ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
              : typeConfig.singleBuilding
              ? `La vista aérea ${agree.del} ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
              : `Lo primero que ve el visitante al entrar al masterplan, con los hotspots de cada ${buildingLabelLower}.`}</p>
            </div>
            <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
              {slides.map(slide => {
                const slideHotspots = hotspots.filter(h => h.slide_id === slide.id);
                const isExpanded = expandedSlideId === slide.id;
                const delimitLabel = hasUnitStep
                  ? `Delimitar ${pluralize(buildingLabelLower)} →`
                  : `Marcar ${agree.el} ${buildingLabelLower} →`;
                return (
                  <div key={slide.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
                    <button
                      type="button"
                      onClick={() => setExpandedSlideId(isExpanded ? null : slide.id)}
                      className="relative aspect-[16/9] bg-cover bg-center bg-gray-100"
                      style={slide.image_url ? { backgroundImage: `url(${slide.image_url})` } : { background: 'repeating-linear-gradient(135deg, #EFECE6 0 12px, #F5F3EE 12px 24px)' }}
                      title="Editar la foto o el video"
                    >
                      <span className="absolute top-2.5 left-2.5 flex gap-1.5">
                        <Pill tone="dark">{slide.video_url ? 'Video' : 'Foto'}</Pill>
                        {slideHotspots.length === 0 && <Pill tone="warn">Sin hotspots</Pill>}
                      </span>
                      <span
                        role="button"
                        aria-label="Borrar vista"
                        onClick={e => { e.stopPropagation(); handleDeleteSlide(slide.id); }}
                        className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-white/95 flex items-center justify-center text-sm text-gray-700 hover:text-red-700"
                      >
                        ✕
                      </span>
                    </button>
                    <div className="p-3.5 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="m-0 font-semibold text-sm text-gray-900 truncate">{slide.label}</p>
                        <span className="text-[11px] text-gray-500 shrink-0">{slideHotspots.length} {slideHotspots.length === 1 ? 'hotspot' : 'hotspots'}</span>
                      </div>
                      {slideHotspots.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {slideHotspots.map(h => {
                            const b = buildings.find(bb => bb.id === h.building_id);
                            return (
                              <span key={h.id} className="min-h-[24px] pl-2 pr-1 flex items-center gap-1 rounded-full bg-gray-100 text-[11px] text-gray-700">
                                {b?.name ?? `(${buildingLabelLower} ${agree.borrado})`}
                                <button type="button" aria-label="Quitar hotspot" onClick={() => handleDeleteHotspot(h.id)} className="w-5 h-5 rounded-full text-gray-500 hover:text-red-700">×</button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Link href={`/admin/proyecto/aereas/${slide.id}`} className={`${btnSecondary} flex-1 !min-h-[36px] text-[13px]`}>{delimitLabel}</Link>
                        <button type="button" onClick={() => setExpandedSlideId(isExpanded ? null : slide.id)} aria-label="Editar foto o video"
                          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-700 hover:border-gray-400">✎</button>
                      </div>
                      {isExpanded && (
                        <div className="grid grid-cols-1 gap-3 pt-3 border-t border-gray-200">
                          <ImageUploader label="Foto (poster / respaldo)" value={slide.image_url} onChange={url => handleUpdateSlide(slide.id, { imageUrl: url })} folder="aerial" />
                          <VideoUploader label="Video (opcional — reemplaza la foto si está)" value={slide.video_url ?? ''} onChange={url => handleUpdateSlide(slide.id, { videoUrl: url })} folder="aerial" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              <form onSubmit={handleAddSlide} className="rounded-2xl border-[1.5px] border-dashed border-gray-300 bg-gray-50 p-4 flex flex-col gap-3">
                <div>
                  <p className="m-0 text-sm font-semibold text-gray-900">Agregar {aerialLower}</p>
                  <p className="m-0 mt-0.5 text-xs text-gray-600">Foto o video de dron. Después ubicás los hotspots sobre la imagen.</p>
                </div>
                <input
                  value={newSlide.label}
                  onChange={e => setNewSlide({ ...newSlide, label: e.target.value })}
                  placeholder={hasUnitStep ? 'Etiqueta (ej: Vista Norte)' : 'Etiqueta (ej: Frente)'}
                  aria-label={`Etiqueta de la ${aerialLower}`}
                  className={fieldClass}
                />
                <ImageUploader label="Foto (poster / respaldo)" value={newSlide.imageUrl} onChange={url => setNewSlide({ ...newSlide, imageUrl: url })} onUploadingChange={setNewSlideImageUploading} folder="aerial" />
                <VideoUploader label="Video (opcional)" value={newSlide.videoUrl} onChange={url => setNewSlide({ ...newSlide, videoUrl: url })} onUploadingChange={setNewSlideVideoUploading} folder="aerial" />
                <button type="submit" disabled={newSlideImageUploading || newSlideVideoUploading} className={btnPrimary}>
                  {newSlideImageUploading || newSlideVideoUploading ? 'Subiendo...' : `+ Agregar ${aerialLower}`}
                </button>
              </form>
            </div>
          </section>

          {/* Colaboradores — créditos públicos, no acceso al admin (diseño "Equipo"). */}
          <SectionRow
            title="Equipo"
            description="Acreditá a quien trabajó en el proyecto por su handle. El crédito queda pendiente hasta que esa persona lo confirma; recién ahí aparece en la ficha y en su portfolio."
          >
            {project.academic_team && (
              <p className="m-0 px-4 py-3 text-[13px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">
                Antes tenías cargado como texto libre: <span className="font-semibold">&ldquo;{project.academic_team}&rdquo;</span>. Ese campo se sacó porque quedaba duplicado con esto — agregalos acá como colaboradores reales para que puedan confirmarlo.
              </p>
            )}
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              {collaborators.map((c, i) => (
                <div key={c.id} className={`px-4 py-3.5 flex items-center gap-3.5 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-brand-700 text-white overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-semibold">
                    {c.profile?.avatar_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.profile.avatar_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (c.profile?.display_name ?? '?').split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="m-0 text-sm font-semibold text-gray-900 truncate">{c.profile?.display_name ?? c.profile?.handle ?? '(perfil borrado)'}</p>
                      <Pill tone={c.status === 'accepted' ? 'green' : c.status === 'pending' ? 'warn' : 'neutral'}>{COLLABORATOR_STATUS_LABEL[c.status]}</Pill>
                    </div>
                    {editingCollaboratorId === c.id ? (
                      <div className="flex items-center gap-2 mt-1.5">
                        <input value={editingContribution} onChange={e => setEditingContribution(e.target.value)} className={`${fieldClass} !min-h-[36px]`} autoFocus aria-label="Qué hizo" />
                        <button type="button" onClick={() => handleSaveCollaboratorEdit(c.id)} className="min-h-[36px] px-2 text-[13px] font-semibold text-brand-700 shrink-0">Guardar</button>
                        <button type="button" onClick={() => setEditingCollaboratorId(null)} className="min-h-[36px] px-2 text-[13px] text-gray-600 shrink-0">Cancelar</button>
                      </div>
                    ) : (
                      c.contribution && <p className="m-0 text-[13px] text-gray-600 truncate">{c.contribution}</p>
                    )}
                    {c.status === 'accepted' && editingCollaboratorId !== c.id && (
                      <p className="m-0 text-[11px] text-gray-500 mt-0.5">Si editás lo que hizo, vuelve a pedirle confirmación.</p>
                    )}
                  </div>
                  {editingCollaboratorId !== c.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button type="button" onClick={() => startEditingCollaborator(c)} className="min-h-[36px] px-2.5 text-[13px] text-gray-700 hover:text-gray-900">Editar</button>
                      <button type="button" onClick={() => handleRemoveCollaborator(c.id)} className="min-h-[36px] px-2.5 text-[13px] text-red-700 hover:text-red-800">Quitar</button>
                    </div>
                  )}
                </div>
              ))}
              {collaborators.length === 0 && (
                <p className="m-0 px-4 py-6 text-sm text-gray-500 text-center">Todavía no acreditaste a nadie en este proyecto.</p>
              )}
              <form onSubmit={handleAddCollaborator} className="p-4 bg-gray-50 border-t border-gray-200 flex flex-col gap-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <PersonSearchSelect
                    selected={selectedCollaborator}
                    onSelect={setSelectedCollaborator}
                    onClear={() => setSelectedCollaborator(null)}
                    placeholder="Buscar por nombre o handle..."
                  />
                  <input
                    value={newCollaborator.contribution}
                    onChange={e => setNewCollaborator({ ...newCollaborator, contribution: e.target.value })}
                    placeholder="Qué hizo (ej: Renders y maqueta)"
                    aria-label="Qué hizo en el proyecto"
                    className={fieldClass}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  {collaboratorError && <p className="m-0 text-sm text-red-600">{collaboratorError}</p>}
                  <button type="submit" disabled={addingCollaborator || !selectedCollaborator} className={`${btnPrimary} ml-auto`}>
                    {addingCollaborator ? 'Agregando...' : '+ Acreditar'}
                  </button>
                </div>
              </form>
            </div>
          </SectionRow>

          {/* Comentarios — moderación; se publican desde la ficha pública. */}
          <SectionRow title="Comentarios" description="Lo que dejan los visitantes en la ficha pública. Podés borrar cualquiera.">
            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
              {comments.map((c, i) => (
                <div key={c.id} className={`px-4 py-3.5 flex items-start gap-3.5 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                  <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-semibold text-gray-700">
                    {c.author?.avatar_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.author.avatar_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      (c.author?.display_name ?? 'U').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="m-0 text-sm font-semibold text-gray-900">{c.author?.display_name ?? 'Usuario'}</p>
                      <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    <p className="m-0 text-sm text-gray-700 mt-0.5 whitespace-pre-line">{c.body}</p>
                  </div>
                  <button type="button" onClick={() => handleDeleteComment(c.id)} className="min-h-[36px] px-2 text-[13px] text-gray-600 hover:text-red-700 shrink-0">Borrar</button>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="m-0 px-4 py-6 text-sm text-gray-500 text-center">Todavía no hay comentarios en este proyecto.</p>
              )}
            </div>
          </SectionRow>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-7 border-t border-gray-200">
            <p className="m-0 text-xs text-gray-600 max-w-md">
              ¿Necesitás borrar este proyecto? Se elimina la ficha, el sitio público y su link — no se puede deshacer.
            </p>
            <button type="button" onClick={() => setDeleteOpen(true)} className="min-h-[40px] text-[13px] font-semibold text-red-700 hover:text-red-800 shrink-0">
              Eliminar este proyecto
            </button>
          </div>
        </div>
      </div>

      {/* Vista en vivo — la portada del sitio con lo que se está escribiendo. */}
      <aside aria-label="Vista en vivo" className="flex-[1_1_340px] lg:max-w-[380px] min-w-0 px-4 py-8 sm:px-6 bg-[#EFECE6] border-t lg:border-t-0 lg:border-l border-gray-200">
        <div className="lg:sticky lg:top-8 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] font-semibold text-gray-900">Vista en vivo</span>
            <a href={publishState.siteHref} target="_blank" rel="noopener noreferrer" className="min-h-[36px] px-3 flex items-center rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-900 hover:border-gray-400">
              {publishState.published ? 'Ver sitio ↗' : 'Vista previa ↗'}
            </a>
          </div>
          <div className="rounded-2xl overflow-hidden bg-white border border-gray-200 shadow-[0_1px_2px_rgba(23,25,26,0.06),0_12px_32px_-12px_rgba(23,25,26,0.18)]">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-200">
              <span className="w-2 h-2 rounded-full bg-gray-300" /><span className="w-2 h-2 rounded-full bg-gray-300" /><span className="w-2 h-2 rounded-full bg-gray-300" />
              <span className="ml-2 font-mono text-[10px] text-gray-600 truncate">{displayUrl.replace(/^https?:\/\//, '')}</span>
            </div>
            <div
              className="relative min-h-[300px] p-5 flex flex-col justify-end gap-2 bg-cover bg-center"
              style={project.masterplan_image
                ? { backgroundImage: `linear-gradient(180deg, rgba(23,25,26,.15), rgba(23,25,26,.78)), url(${project.masterplan_image})` }
                : { background: 'repeating-linear-gradient(135deg, #2B302D 0 14px, #313733 14px 28px)' }}
            >
              {!project.masterplan_image && (
                <span className="absolute left-1/2 top-[22%] -translate-x-1/2 whitespace-nowrap text-[10px] tracking-[0.12em] uppercase text-[#C9C6BE] border border-dashed border-[#6B6A65] rounded px-2.5 py-1">[ Imagen de portada ]</span>
              )}
              {project.location && <span className="text-[10px] font-semibold tracking-[0.14em] uppercase text-[#E4E0D8]">{project.location}</span>}
              <span className="font-display text-[28px] leading-[1.05] font-semibold text-white tracking-[-0.02em]">{project.name || 'Nombre del proyecto'}</span>
              <span className="text-[13px] leading-snug text-white/90">{project.tagline || 'La bajada aparece acá'}</span>
              <span className="flex gap-2 pt-2">
                <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white text-gray-900">{saleMode === 'venta' ? 'Ver unidades' : 'Ver proyecto'}</span>
                <span className="text-[11px] font-semibold px-3 py-1.5 rounded-full border border-white/70 text-white">Consultar</span>
              </span>
            </div>
            <div className="grid grid-cols-3 px-4 py-3 gap-2">
              <div><div className="font-display text-base font-semibold text-gray-900">{buildings.length}</div><div className="text-[10px] text-gray-500">{buildings.length === 1 ? buildingLabelLower : pluralize(buildingLabelLower)}</div></div>
              <div><div className="font-display text-base font-semibold text-gray-900">{unitPrices.total || '—'}</div><div className="text-[10px] text-gray-500">unidades</div></div>
              <div><div className="font-display text-base font-semibold text-gray-900">{slides.length}</div><div className="text-[10px] text-gray-500">{slides.length === 1 ? aerialLower : aerialLabelPlural.toLowerCase()}</div></div>
            </div>
          </div>

          {/* Checklist RECOMENDADO — no bloquea publicar. */}
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-gray-900">{checklistMissing.length === 0 ? 'Ficha completa' : 'Para una ficha completa'}</span>
              <span className="font-display text-[13px] font-semibold text-gray-900">{checklistOk}/{checklistItems.length}</span>
            </div>
            <div className="h-1 rounded-full bg-gray-200 overflow-hidden" aria-hidden="true">
              <div className="h-full rounded-full bg-brand-700" style={{ width: `${checklistPct}%` }} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {checklistItems.map(item => (
                <span key={item.label} className={`min-h-[28px] px-2.5 flex items-center gap-1.5 rounded-full text-xs ${item.ok ? 'bg-brand-100 text-brand-800 font-medium' : 'bg-white border border-gray-200 text-gray-600'}`}>
                  {item.ok ? '✓' : '·'} {item.label}
                </span>
              ))}
            </div>
            <p className="m-0 text-xs text-gray-600">No es obligatorio para publicar.</p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTogglePublished}
              disabled={publishing || (!publishState.published && !publishState.canPublish)}
              title={!publishState.published && !publishState.canPublish ? `Para publicar falta: ${publishState.missingRequired.join(', ')}` : undefined}
              className={`${publishState.published ? btnSecondary : btnPrimary} flex-1`}
            >
              {publishing ? 'Guardando...' : publishState.published ? 'Despublicar' : 'Publicar sitio'}
            </button>
          </div>
        </div>
      </aside>

      {/* Barra flotante de cambios sin guardar — cubre Identidad, Ficha
          académica, Galería de proceso y Antes/Después (todos comparten el
          mismo objeto `project` y el mismo PATCH). */}
      {dirty && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 pl-4 pr-2.5 py-2.5 bg-gray-900 rounded-xl shadow-2xl">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="text-sm text-white">Cambios sin guardar en la ficha</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={discardChanges}
              className="h-8 px-3 border border-white/20 rounded-lg text-xs font-medium text-white/85 hover:bg-white/10"
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={() => handleSaveProject()}
              disabled={saving}
              className="h-8 px-3.5 bg-brand-500 rounded-lg text-xs font-medium text-white hover:bg-brand-400 disabled:opacity-60"
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      <DeleteProjectModal
        project={deleteOpen ? project : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { window.location.href = '/admin/proyectos'; }}
      />
    </div>
  );
}
