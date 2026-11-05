'use client';

import { useCallback, useEffect, useState, startTransition, type ReactNode } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { usePublishState } from '@/lib/publish-state-context';
import { useToast } from '@/components/ui/ToastProvider';
import type { ProjectRow as DbProjectRow, BuildingRow as DbBuildingRow, AerialSlideRow, AerialHotspotRow } from '@/types/database';

// Estado compartido por los capítulos de la ficha (/admin/proyecto/*):
// cada pantalla carga GET /api/admin/project, edita una copia local del
// proyecto y guarda con el mismo PATCH. La barra de "cambios sin guardar"
// manda SOLO los campos que cambiaron en esa pantalla, así guardar un
// capítulo nunca pisa lo que se editó en otro.

export type FichaProject = Pick<DbProjectRow,
  | 'id' | 'slug' | 'name' | 'description' | 'tagline' | 'location' | 'latitude' | 'longitude' | 'masterplan_image'
  | 'academic_institution' | 'academic_career' | 'academic_tutor' | 'academic_year' | 'academic_team'
  | 'process_gallery' | 'before_after' | 'published' | 'project_type' | 'sale_mode' | 'construction_progress'
>;
export type FichaBuilding = Pick<DbBuildingRow, 'id' | 'slug' | 'name' | 'total_floors'>;
export type FichaSlide = Pick<AerialSlideRow, 'id' | 'image_url' | 'video_url' | 'label' | 'sort_order'>;
export type FichaHotspot = Pick<AerialHotspotRow, 'id' | 'slide_id' | 'building_id' | 'x' | 'y'>;

export interface FichaCollaborator {
  id: string;
  contribution: string;
  status: 'pending' | 'accepted' | 'declined';
  profile: { handle: string; display_name: string; avatar_image: string | null } | null;
}

export interface FichaComment {
  id: string;
  body: string;
  created_at: string;
  author: { handle: string; display_name: string; avatar_image: string | null } | null;
}

// Columna → clave del body del PATCH /api/admin/project.
const PATCH_KEY: Partial<Record<keyof FichaProject, string>> = {
  name: 'name',
  description: 'description',
  tagline: 'tagline',
  location: 'location',
  latitude: 'latitude',
  longitude: 'longitude',
  masterplan_image: 'masterplanImage',
  academic_institution: 'academicInstitution',
  academic_career: 'academicCareer',
  academic_tutor: 'academicTutor',
  academic_year: 'academicYear',
  academic_team: 'academicTeam',
  process_gallery: 'processGallery',
  before_after: 'beforeAfter',
  construction_progress: 'constructionProgress',
};

export function useFichaProject() {
  const activeProjectId = useActiveProjectId();
  const publishState = usePublishState();
  const toast = useToast();
  const [project, setProject] = useState<FichaProject | null>(null);
  const [savedProject, setSavedProject] = useState<FichaProject | null>(null);
  const [buildings, setBuildings] = useState<FichaBuilding[]>([]);
  const [slides, setSlides] = useState<FichaSlide[]>([]);
  const [hotspots, setHotspots] = useState<FichaHotspot[]>([]);
  const [collaborators, setCollaborators] = useState<FichaCollaborator[]>([]);
  const [comments, setComments] = useState<FichaComment[]>([]);
  const [unitPrices, setUnitPrices] = useState({ total: 0, priced: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    startTransition(() => { setLoadError(false); });
    return fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => { if (!res.ok) throw new Error(String(res.status)); return res.json(); })
      .then(data => {
        setProject(data.project);
        setSavedProject(data.project);
        setBuildings(data.buildings ?? []);
        setSlides(data.slides ?? []);
        setHotspots(data.hotspots ?? []);
        setCollaborators(data.collaborators ?? []);
        setComments(data.comments ?? []);
        setUnitPrices(data.unitPrices ?? { total: 0, priced: 0 });
      })
      .catch(err => { console.error(err); setLoadError(true); })
      .finally(() => setLoading(false));
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  const changedKeys = project && savedProject
    ? (Object.keys(PATCH_KEY) as (keyof FichaProject)[]).filter(k => JSON.stringify(project[k]) !== JSON.stringify(savedProject[k]))
    : [];
  const dirty = changedKeys.length > 0;

  const save = useCallback(async () => {
    if (!project || !savedProject) return false;
    const body: Record<string, unknown> = {};
    for (const k of Object.keys(PATCH_KEY) as (keyof FichaProject)[]) {
      if (JSON.stringify(project[k]) !== JSON.stringify(savedProject[k])) body[PATCH_KEY[k] as string] = project[k];
    }
    if (Object.keys(body).length === 0) return true;
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      setSavedProject(project);
      publishState.refresh();
      toast('Guardado.');
      return true;
    }
    toast('Error al guardar.', 'error');
    return false;
  }, [project, savedProject, activeProjectId, publishState, toast]);

  const discard = useCallback(() => { if (savedProject) setProject(savedProject); }, [savedProject]);

  return {
    project, setProject, savedProject, setSavedProject,
    buildings, slides, setSlides, hotspots, collaborators, comments, setComments, unitPrices,
    loading, loadError, reload: load, saving, save, discard, dirty,
  };
}

/** Barra flotante de cambios sin guardar (misma de siempre, compartida por los capítulos). */
export function UnsavedBar({ dirty, saving, onSave, onDiscard, label = 'Cambios sin guardar en la ficha' }: {
  dirty: boolean; saving: boolean; onSave: () => void; onDiscard: () => void; label?: string;
}) {
  if (!dirty) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 pl-4 pr-2.5 py-2.5 bg-gray-900 rounded-xl shadow-2xl max-w-[calc(100vw-32px)]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
        <span className="text-sm text-white truncate">{label}</span>
      </div>
      <div className="flex gap-2 shrink-0">
        <button type="button" onClick={onDiscard} className="min-h-[36px] px-3 border border-white/20 rounded-lg text-xs font-medium text-white/85 hover:bg-white/10">
          Descartar
        </button>
        <button type="button" onClick={onSave} disabled={saving} className="min-h-[36px] px-3.5 bg-white rounded-lg text-xs font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-60">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

/**
 * Layout de un capítulo: columna de formulario y, si se pasa, la "Vista en
 * vivo" beige a la derecha (anula el padding del shell para ocupar todo el alto).
 */
export function FichaLayout({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  if (!aside) {
    return <div className="max-w-[1080px] mx-auto flex flex-col gap-7">{children}</div>;
  }
  return (
    <div className="-m-6 md:-m-8 flex flex-wrap items-stretch min-h-screen">
      <div className="flex-[999_1_600px] min-w-0 px-4 py-8 sm:px-10 sm:py-10">
        <div className="max-w-[760px] mx-auto flex flex-col gap-7">{children}</div>
      </div>
      <aside aria-label="Vista en vivo" className="flex-[1_1_340px] lg:max-w-[400px] min-w-0 px-4 py-8 sm:px-6 bg-[#EFECE6] border-t lg:border-t-0 lg:border-l border-gray-200">
        <div className="lg:sticky lg:top-8 flex flex-col gap-4">{aside}</div>
      </aside>
    </div>
  );
}
