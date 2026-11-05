'use client';

import { useState, useEffect } from 'react';
import { slugify } from '@/lib/slug';
import { PageHeader, SegmentedTabs, btnSecondary } from '@/components/admin/panel-ui';
import { getProjectDisplayUrl } from '@/lib/project-url';
import CalculatorEditor from '@/components/admin/section-editors/CalculatorEditor';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { usePublishState } from '@/lib/publish-state-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, canonicalProjectType } from '@/lib/project-types';
import type { ProjectSaleMode, ProjectType } from '@/types';

export default function SettingsPage() {
  const { showCalculator } = useProjectTypeConfig();
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const publishState = usePublishState();
  const [project, setProject] = useState<{ id: string; slug: string; name: string; project_type: string; sale_mode: string; published: boolean } | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [savingPublished, setSavingPublished] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [slugDraft, setSlugDraft] = useState<string | null>(null);
  const [savingSlug, setSavingSlug] = useState(false);

  useEffect(() => {
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => setProject(data.project
        ? { id: data.project.id, slug: data.project.slug, name: data.project.name, project_type: data.project.project_type, sale_mode: data.project.sale_mode, published: data.project.published }
        : null))
      .catch(() => {});
  }, [activeProjectId]);

  // La FORMA del proyecto (edificio/casa/loteo…) se elige al crearlo y no
  // se cambia — define toda la jerarquía y ya hay estructura colgando. Lo
  // único ajustable acá es el PROPÓSITO: para vender ↔ solo para mostrar.
  const structure = project ? PROJECT_STRUCTURES[canonicalProjectType(project.project_type) as ProjectType] : undefined;
  const allowedModes = structure?.allowedSaleModes ?? (['venta', 'showcase'] as ProjectSaleMode[]);

  const handleSaveMode = async (saleMode: ProjectSaleMode) => {
    if (!project || saleMode === project.sale_mode) return;
    setSavingMode(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ saleMode }),
    });
    if (res.ok) {
      // Recarga entera: el propósito lo lee el shell del lado del servidor
      // y lo mete en el contexto que consume todo el panel.
      window.location.reload();
    } else {
      setSavingMode(false);
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo cambiar el propósito del proyecto.', 'error');
    }
  };

  // Mismo estado (y misma validación del mínimo) que el sidebar y /admin/proyecto.
  const handleTogglePublished = async () => {
    setSavingPublished(true);
    const r = await publishState.setPublished(!publishState.published);
    setSavingPublished(false);
    if (!r.ok) toast(r.error ?? 'No se pudo cambiar la visibilidad del proyecto.', 'error');
  };

  const [duplicating, setDuplicating] = useState(false);
  const handleDuplicate = async () => {
    if (!project) return;
    setDuplicating(true);
    const res = await fetch(`/api/admin/projects/${project.id}/duplicate`, { method: 'POST' });
    setDuplicating(false);
    if (res.ok) toast('Proyecto duplicado. Lo encontrás en Mis proyectos.');
    else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo duplicar el proyecto.', 'error');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = project ? getProjectDisplayUrl(project.slug, origin) : '';
  // El link se arma alrededor del slug: /proyecto/[slug] o [slug].dominio.
  const [urlPrefix, urlSuffix] = getProjectDisplayUrl('__SLUG__', origin).replace(/^https?:\/\//, '').split('__SLUG__');
  const slugValue = slugDraft ?? project?.slug ?? '';
  const slugChanged = !!project && slugify(slugValue) !== project.slug;

  const handleSaveSlug = async () => {
    if (!project) return;
    const next = slugify(slugValue);
    if (!next) { toast('El link tiene que tener al menos una letra o un número.', 'error'); return; }
    setSavingSlug(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: next }),
    });
    setSavingSlug(false);
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      setProject(p => (p ? { ...p, slug: data.slug ?? next } : p));
      setSlugDraft(null);
      toast('Link actualizado. El anterior ya no funciona.');
      // El sidebar (Vista previa, compartir) lee el slug del layout del servidor.
      setTimeout(() => window.location.reload(), 900);
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo cambiar el link.', 'error');
    }
  };
  const visibilityOption = (on: boolean) =>
    `text-left flex flex-col gap-1 min-h-[76px] px-4 py-3.5 rounded-xl transition-colors disabled:cursor-not-allowed ${
      on ? 'border-[1.5px] border-gray-900 bg-brand-50' : 'border border-gray-200 bg-white hover:border-gray-300 disabled:opacity-60'
    }`;

  return (
    <div className="max-w-[800px] mx-auto flex flex-col gap-7">
      <PageHeader eyebrow="Proyecto" title="Configuración" />

      {project && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="px-5 sm:px-6 py-5 border-b border-gray-200">
            <h2 className="m-0 text-[15px] font-semibold text-gray-900">Visibilidad del sitio</h2>
          </div>
          <div className="px-5 sm:px-6 py-5 flex flex-col gap-5">
            <div role="radiogroup" aria-label="Visibilidad del sitio" className="grid gap-3 sm:grid-cols-2">
              <button type="button" role="radio" aria-checked={publishState.published}
                onClick={() => { if (!publishState.published) handleTogglePublished(); }}
                disabled={savingPublished || (!publishState.published && !publishState.canPublish)}
                className={visibilityOption(publishState.published)}>
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className="w-2 h-2 rounded-full bg-brand-700" aria-hidden="true" />Publicado</span>
                <span className="text-xs text-gray-600">
                  {publishState.published || publishState.canPublish ? 'Cualquiera con el link lo ve' : `Para publicar falta: ${publishState.missingRequired.join(', ')}.`}
                </span>
              </button>
              <button type="button" role="radio" aria-checked={!publishState.published}
                onClick={() => { if (publishState.published) handleTogglePublished(); }}
                disabled={savingPublished}
                className={visibilityOption(!publishState.published)}>
                <span className="flex items-center gap-2 text-sm font-semibold text-gray-900"><span className="w-2 h-2 rounded-full bg-gray-400" aria-hidden="true" />Borrador</span>
                <span className="text-xs text-gray-600">Solo vos lo ves, como vista previa. Los demás ven &quot;no disponible&quot;.</span>
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-slug" className="text-xs font-medium text-gray-700">Dirección pública</label>
              <span className="flex items-center gap-2 min-h-[46px] pl-3.5 pr-1.5 rounded-[10px] border border-gray-300 bg-white focus-within:border-brand-700 focus-within:ring-2 focus-within:ring-brand-500/30">
                <span className="flex-1 min-w-0 flex items-center font-mono text-[13px]">
                  <span className="text-gray-500 truncate shrink">{urlPrefix}</span>
                  <input id="project-slug" value={slugValue} onChange={e => setSlugDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && slugChanged) handleSaveSlug(); if (e.key === 'Escape') setSlugDraft(null); }}
                    spellCheck={false} autoComplete="off"
                    className="min-w-[80px] flex-1 bg-transparent text-gray-900 outline-none" />
                  {urlSuffix && <span className="text-gray-500 shrink-0">{urlSuffix}</span>}
                </span>
                {slugChanged ? (
                  <button type="button" onClick={handleSaveSlug} disabled={savingSlug}
                    className="shrink-0 min-h-[36px] px-3 rounded-lg bg-gray-900 text-white text-[13px] font-semibold hover:bg-black disabled:opacity-60">
                    {savingSlug ? 'Guardando…' : 'Guardar'}
                  </button>
                ) : (
                  <button type="button" onClick={() => { navigator.clipboard?.writeText(publicUrl); toast('Link copiado.'); }}
                    className="shrink-0 min-h-[36px] px-3 rounded-lg text-[13px] font-semibold text-gray-900 hover:bg-gray-100">Copiar</button>
                )}
              </span>
              {slugChanged && (
                <span className="text-xs text-amber-800">Va a quedar <span className="font-mono">{slugify(slugValue) || '—'}</span>. El link anterior deja de funcionar para quien ya lo tenga.</span>
              )}
            </div>
          </div>
        </section>
      )}

      {project && (
        <section className="rounded-2xl border border-gray-200 bg-white">
          <div className="px-5 sm:px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
            <h2 className="m-0 text-[15px] font-semibold text-gray-900">Comercial</h2>
            {allowedModes.length > 1 ? (
              <SegmentedTabs label="Propósito del proyecto" value={project.sale_mode as ProjectSaleMode}
                onChange={v => handleSaveMode(v)}
                options={allowedModes.map(m => ({ value: m, label: PROJECT_SALE_MODES[m].label }))} />
            ) : (
              <span className="text-xs text-gray-600">Solo puede ser &ldquo;{PROJECT_SALE_MODES[allowedModes[0]].label}&rdquo;</span>
            )}
          </div>
          <div className="px-5 sm:px-6 py-5 flex flex-col gap-4">
            <p className="m-0 text-[13px] leading-relaxed text-gray-600">
              {PROJECT_SALE_MODES[project.sale_mode as ProjectSaleMode]?.description ?? ''} La forma del proyecto ({structure?.label ?? project.project_type}) se define al crearlo y no se cambia desde acá.
            </p>
            {savingMode && <p className="m-0 text-sm text-gray-600">Guardando…</p>}
            {showCalculator && (
              <div className="pt-4 border-t border-gray-200">
                <CalculatorEditor showSiteToggle />
              </div>
            )}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-red-200 bg-white px-5 sm:px-6 py-5 flex items-center gap-4 flex-wrap">
        <div className="flex-[1_1_260px] min-w-0 flex flex-col gap-0.5">
          <h2 className="m-0 text-[15px] font-semibold text-red-800">Zona de peligro</h2>
          <p className="m-0 text-xs leading-relaxed text-gray-600">Duplicar copia toda la ficha y las unidades. Eliminar borra todo lo cargado y no se puede deshacer.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button type="button" onClick={handleDuplicate} disabled={!project || duplicating} className={btnSecondary}>
            {duplicating ? 'Duplicando…' : 'Duplicar proyecto'}
          </button>
          <button type="button" onClick={() => setDeleteOpen(true)} disabled={!project}
            className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-[10px] border border-red-300 bg-white text-red-700 text-sm font-semibold hover:bg-red-50 disabled:opacity-50">
            Eliminar proyecto
          </button>
        </div>
      </section>

      <DeleteProjectModal
        project={deleteOpen ? project : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { window.location.href = '/admin/proyectos'; }}
      />
    </div>
  );
}
