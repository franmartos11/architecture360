'use client';

import { useState } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import VideoUploader from '@/components/admin/VideoUploader';
import { FichaSkeleton } from '@/components/admin/PanelSkeletons';
import ErrorState from '@/components/ui/ErrorState';
import { SectionRow, Pill, btnPrimary, btnSecondary, fieldClass } from '@/components/admin/panel-ui';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useFichaProject, UnsavedBar, FichaLayout } from '@/components/admin/section-editors/ficha-data';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { usePublishState } from '@/lib/publish-state-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';
import { pluralize } from '@/lib/units';

// Capítulo 3 — Galería: las vistas aéreas / frontales (la entrada al
// masterplan, con sus hotspots) y, en proyectos para mostrar, la galería
// de proceso. Las vistas se guardan al toque (API propia); el proceso va
// por la barra de cambios sin guardar, como el resto de la ficha.

export default function GaleriaPage() {
  const typeConfig = useProjectTypeConfig();
  const { saleMode, buildingLabel, hasUnitStep, aerialLabel, aerialLabelPlural } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  const buildingLabelLower = buildingLabel.toLowerCase();
  const aerialLower = aerialLabel.toLowerCase();
  const ficha = useFichaProject();
  const { project, setProject, buildings, slides, setSlides, hotspots } = ficha;
  const toast = useToast();
  const confirmDialog = useConfirm();
  const activeProjectId = useActiveProjectId();
  const publishState = usePublishState();
  const [expandedSlideId, setExpandedSlideId] = useState<string | null>(null);
  const [newSlide, setNewSlide] = useState({ imageUrl: '', videoUrl: '', label: '' });
  const [newSlideImageUploading, setNewSlideImageUploading] = useState(false);
  const [newSlideVideoUploading, setNewSlideVideoUploading] = useState(false);

  if (ficha.loading) return <FichaSkeleton rows={3} />;
  if (ficha.loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={ficha.reload} />;

  const handleAddSlide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newSlideImageUploading || newSlideVideoUploading) { toast('Esperá a que termine de subir el archivo.', 'error'); return; }
    if (!newSlide.imageUrl || !newSlide.label) { toast('Faltan la foto y/o la etiqueta.', 'error'); return; }
    const res = await fetch(withActiveProject('/api/admin/aerial-slides', activeProjectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newSlide, sortOrder: slides.length }),
    });
    if (res.ok) {
      setNewSlide({ imageUrl: '', videoUrl: '', label: '' });
      ficha.reload();
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
    if (res.ok) { ficha.reload(); publishState.refresh(); }
  };

  const handleDeleteHotspot = async (id: string) => {
    const res = await fetch(`/api/admin/aerial-hotspots/${id}`, { method: 'DELETE' });
    if (res.ok) ficha.reload();
  };

  return (
    <FichaLayout>
      <ChapterHeader
        title="Galería"
        description={saleMode === 'showcase'
          ? 'Las imágenes que abren el proyecto y el proceso detrás: bocetos, maquetas, diagramas.'
          : `Las imágenes que abren el proyecto. ${hasUnitStep ? `Sobre cada una marcás ${typeConfig.buildingLabelGender === 'f' ? 'las' : 'los'} ${pluralize(buildingLabelLower)} para que se puedan tocar.` : ''}`}
        actions={<span />}
      />

      <SectionRow
        title={aerialLabelPlural}
        description={!hasUnitStep
          ? `La foto del frente de la ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
          : typeConfig.singleBuilding
          ? `La vista aérea ${agree.del} ${buildingLabelLower} — lo primero que se ve al entrar al masterplan.`
          : `Lo primero que ve el visitante al entrar al masterplan, con los hotspots de cada ${buildingLabelLower}.`}
        badge={slides.length === 0 ? <Pill tone="warn">Sin {aerialLabelPlural.toLowerCase()}</Pill> : <Pill tone="green">{slides.length} cargada{slides.length === 1 ? '' : 's'}</Pill>}
        first
      >
        <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
          {slides.map(slide => {
            const slideHotspots = hotspots.filter(h => h.slide_id === slide.id);
            const isExpanded = expandedSlideId === slide.id;
            const delimitLabel = hasUnitStep ? `Delimitar ${pluralize(buildingLabelLower)} →` : `Marcar ${agree.el} ${buildingLabelLower} →`;
            return (
              <div key={slide.id} className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
                <div className="relative aspect-[16/9] bg-cover bg-center bg-gray-100"
                  style={slide.image_url ? { backgroundImage: `url(${slide.image_url})` } : { background: 'repeating-linear-gradient(135deg, #EFECE6 0 12px, #F5F3EE 12px 24px)' }}>
                  <span className="absolute top-2.5 left-2.5 flex gap-1.5">
                    <Pill tone="dark">{slide.video_url ? 'Video' : 'Foto'}</Pill>
                    {hasUnitStep && slideHotspots.length === 0 && <Pill tone="warn">Sin hotspots</Pill>}
                  </span>
                  <button type="button" aria-label={`Borrar ${slide.label}`} onClick={() => handleDeleteSlide(slide.id)}
                    className="absolute top-2 right-2 w-9 h-9 rounded-lg bg-white/95 flex items-center justify-center text-sm text-gray-700 hover:text-red-700">✕</button>
                </div>
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
                    <Link href={`/admin/proyecto/aereas/${slide.id}`} className={`${btnSecondary} flex-1 !min-h-[40px] text-[13px]`}>{delimitLabel}</Link>
                    <button type="button" onClick={() => setExpandedSlideId(isExpanded ? null : slide.id)} aria-label="Editar foto o video" aria-expanded={isExpanded}
                      className="w-10 h-10 shrink-0 flex items-center justify-center rounded-[10px] border border-gray-300 bg-white text-gray-700 hover:border-gray-400">✎</button>
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
            <input value={newSlide.label} onChange={e => setNewSlide({ ...newSlide, label: e.target.value })}
              placeholder={hasUnitStep ? 'Etiqueta (ej: Vista Norte)' : 'Etiqueta (ej: Frente)'} aria-label={`Etiqueta de la ${aerialLower}`} className={fieldClass} />
            <ImageUploader label="Foto (poster / respaldo)" value={newSlide.imageUrl} onChange={url => setNewSlide({ ...newSlide, imageUrl: url })} onUploadingChange={setNewSlideImageUploading} folder="aerial" />
            <VideoUploader label="Video (opcional)" value={newSlide.videoUrl} onChange={url => setNewSlide({ ...newSlide, videoUrl: url })} onUploadingChange={setNewSlideVideoUploading} folder="aerial" />
            <button type="submit" disabled={newSlideImageUploading || newSlideVideoUploading} className={btnPrimary}>
              {newSlideImageUploading || newSlideVideoUploading ? 'Subiendo...' : `+ Agregar ${aerialLower}`}
            </button>
          </form>
        </div>
      </SectionRow>

      {saleMode === 'showcase' && (
        <SectionRow title="Galería de proceso" description="Bocetos, maquetas, diagramas — el proceso detrás del proyecto, aparte de las fotos finales.">
          <MultiImageUploader values={project.process_gallery} onChange={urls => setProject({ ...project, process_gallery: urls })} folder="process" />
        </SectionRow>
      )}

      <ChapterFooter />
      <UnsavedBar dirty={ficha.dirty} saving={ficha.saving} onSave={() => ficha.save()} onDiscard={ficha.discard} />
    </FichaLayout>
  );
}
