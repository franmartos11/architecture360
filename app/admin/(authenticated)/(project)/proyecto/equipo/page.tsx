'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState } from 'react';
import PersonSearchSelect, { type PersonSearchResult } from '@/components/admin/PersonSearchSelect';
import { FichaSkeleton } from '@/components/admin/PanelSkeletons';
import ErrorState from '@/components/ui/ErrorState';
import { SectionRow, Pill, btnPrimary, fieldClass } from '@/components/admin/panel-ui';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { useFichaProject, UnsavedBar, FichaLayout, type FichaCollaborator } from '@/components/admin/section-editors/ficha-data';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { usePublishState } from '@/lib/publish-state-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';

// Capítulo 7 — Equipo (diseño Ficha · Equipo): quién hizo el proyecto
// (créditos que la persona confirma y que aparecen en su portfolio), los
// comentarios del sitio y, en proyectos para mostrar, la ficha académica.

const STATUS_LABEL: Record<FichaCollaborator['status'], string> = {
  pending: 'Pendiente de confirmar',
  accepted: 'En su portfolio',
  declined: 'Rechazado',
};

function initials(name: string) {
  return name.split(/\s+/).map(w => w.charAt(0)).join('').slice(0, 2).toUpperCase() || '?';
}

export default function EquipoPage() {
  const contentIn = useContentIn();
  const { saleMode } = useProjectTypeConfig();
  const ficha = useFichaProject();
  const { project, setProject, collaborators, comments, setComments } = ficha;
  const toast = useToast();
  const confirmDialog = useConfirm();
  const activeProjectId = useActiveProjectId();
  const publishState = usePublishState();
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [contribution, setContribution] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContribution, setEditingContribution] = useState('');
  const [academicOpen, setAcademicOpen] = useState(false);

  if (ficha.loading) return <FichaSkeleton rows={3} />;
  if (ficha.loadError || !project) return <ErrorState message="No se pudo cargar el proyecto." onRetry={ficha.reload} />;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setAddError('');
    setAdding(true);
    const res = await fetch(withActiveProject('/api/admin/collaborators', activeProjectId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: selected.handle, contribution }),
    });
    setAdding(false);
    if (res.ok) {
      setSelected(null);
      setContribution('');
      ficha.reload();
    } else {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error ?? 'No se pudo agregar.');
    }
  };

  const handleRemove = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Quitar a esta persona de los créditos del proyecto?', confirmLabel: 'Quitar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/admin/collaborators/${id}`, { method: 'DELETE' });
    if (res.ok) ficha.reload(); else toast('No se pudo quitar.', 'error');
  };

  const handleSaveEdit = async (id: string) => {
    const res = await fetch(`/api/admin/collaborators/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contribution: editingContribution }),
    });
    if (res.ok) { setEditingId(null); ficha.reload(); } else toast('No se pudo guardar.', 'error');
  };

  const handleDeleteComment = async (id: string) => {
    const ok = await confirmDialog({ message: '¿Borrar este comentario?', confirmLabel: 'Borrar', danger: true });
    if (!ok) return;
    const res = await fetch(`/api/comments/${id}`, { method: 'DELETE' });
    if (res.ok) setComments(prev => prev.filter(c => c.id !== id));
    else toast('No se pudo borrar.', 'error');
  };

  const academicFilled = !!(project.academic_institution || project.academic_career || project.academic_tutor || project.academic_year);

  return (
    <m.div {...contentIn}>
    <FichaLayout>
      <ChapterHeader
        title="Equipo"
        description="Quién hizo el proyecto. Cada persona confirma su crédito y el proyecto aparece en su portfolio."
        actions={<span />}
      />

      <SectionRow
        title="Personas y estudios"
        description="Buscalos por nombre o handle. El crédito queda pendiente hasta que la persona lo confirma; recién ahí se muestra en la ficha."
        first
      >
        {project.academic_team && (
          <p className="m-0 px-4 py-3 text-[13px] leading-relaxed text-amber-800 bg-amber-50 border border-amber-200 rounded-xl">
            Antes tenías cargado como texto libre: <span className="font-semibold">&ldquo;{project.academic_team}&rdquo;</span>. Agregalos acá como personas reales para que puedan confirmarlo.
          </p>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-2.5 p-4 rounded-2xl border border-gray-200 bg-white">
          <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <PersonSearchSelect selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} placeholder="Buscar persona o estudio…" />
            <input value={contribution} onChange={e => setContribution(e.target.value)} placeholder="Rol (ej: Renders y maqueta)" aria-label="Rol en el proyecto" className={fieldClass} />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {addError ? <p className="m-0 text-sm text-red-600">{addError}</p> : <span className="text-xs text-gray-500">Se les avisa para que confirmen.</span>}
            <button type="submit" disabled={adding || !selected} className={btnPrimary}>{adding ? 'Agregando...' : 'Agregar'}</button>
          </div>
        </form>

        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {collaborators.map((c, i) => {
            const name = c.profile?.display_name ?? c.profile?.handle ?? '(perfil borrado)';
            return (
              <div key={c.id} className={`px-4 py-3.5 flex items-center gap-3.5 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-brand-700 text-white overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-semibold">
                  {c.profile?.avatar_image
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.profile.avatar_image} alt="" className="w-full h-full object-cover" />
                    : initials(name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="m-0 text-sm font-semibold text-gray-900 truncate">{name}</p>
                    {c.profile?.handle && <span className="text-xs text-gray-500">@{c.profile.handle}</span>}
                  </div>
                  {editingId === c.id ? (
                    <div className="flex items-center gap-2 mt-1.5">
                      <input value={editingContribution} onChange={e => setEditingContribution(e.target.value)} className={`${fieldClass} !min-h-[36px]`} autoFocus aria-label="Rol" />
                      <button type="button" onClick={() => handleSaveEdit(c.id)} className="min-h-[36px] px-2 text-[13px] font-semibold text-brand-700 shrink-0">Guardar</button>
                      <button type="button" onClick={() => setEditingId(null)} className="min-h-[36px] px-2 text-[13px] text-gray-600 shrink-0">Cancelar</button>
                    </div>
                  ) : (
                    <p className="m-0 text-[13px] text-gray-600 truncate">{c.contribution || <span className="text-amber-800">Falta el rol</span>}</p>
                  )}
                </div>
                {editingId !== c.id && (
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                    <Pill tone={c.status === 'accepted' ? 'green' : c.status === 'pending' ? 'warn' : 'neutral'}>{STATUS_LABEL[c.status]}</Pill>
                    <button type="button" onClick={() => { setEditingId(c.id); setEditingContribution(c.contribution); }} className="min-h-[36px] px-2 text-[13px] text-gray-700 hover:text-gray-900">Editar</button>
                    <button type="button" onClick={() => handleRemove(c.id)} className="min-h-[36px] px-2 text-[13px] text-red-700 hover:text-red-800">Quitar</button>
                  </div>
                )}
              </div>
            );
          })}
          {collaborators.length === 0 && (
            <p className="m-0 px-4 py-6 text-sm text-gray-500 text-center">Todavía no acreditaste a nadie en este proyecto.</p>
          )}
        </div>
      </SectionRow>

      <SectionRow title="Comentarios en el sitio" description="Lo que dejan los visitantes en la ficha pública. Podés borrar cualquiera.">
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
          {comments.map((c, i) => (
            <div key={c.id} className={`px-4 py-3.5 flex items-start gap-3.5 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
              <div className="w-9 h-9 rounded-full bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center text-[13px] font-semibold text-gray-700">
                {c.author?.avatar_image
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.author.avatar_image} alt="" className="w-full h-full object-cover" />
                  : (c.author?.display_name ?? 'U').charAt(0).toUpperCase()}
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
          {comments.length === 0 && <p className="m-0 px-4 py-6 text-sm text-gray-500 text-center">Todavía no hay comentarios en este proyecto.</p>}
        </div>
      </SectionRow>

      {saleMode === 'showcase' && (
        <SectionRow title="Ficha académica" description="Si es un proyecto de facultad o concurso. Se muestra junto a la memoria." badge={<Pill tone="neutral">Opcional</Pill>}>
          {!academicOpen && !academicFilled ? (
            <button type="button" onClick={() => setAcademicOpen(true)}
              className="self-start min-h-[44px] px-4 rounded-[10px] border border-dashed border-gray-300 text-[13px] font-semibold text-gray-900 hover:border-gray-400">
              + Agregar ficha
            </button>
          ) : (
            <div className="grid gap-3.5 sm:grid-cols-2 p-4 rounded-2xl border border-gray-200 bg-white">
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
          )}
        </SectionRow>
      )}

      <div className="flex items-center gap-4 flex-wrap p-5 rounded-2xl bg-gray-900 text-white">
        <div className="flex-1 min-w-[220px] flex flex-col gap-0.5">
          <span className="text-[15px] font-semibold">Ficha terminada</span>
          <span className="text-xs text-[#C9C6BE]">Es el último capítulo. Revisá cómo quedó el sitio antes de compartirlo.</span>
        </div>
        <a href={publishState.siteHref} target="_blank" rel="noopener noreferrer"
          className="min-h-[44px] px-4 rounded-xl bg-white text-gray-900 text-sm font-semibold inline-flex items-center hover:bg-gray-100">
          Revisar el sitio ↗
        </a>
      </div>

      <ChapterFooter />
      <UnsavedBar dirty={ficha.dirty} saving={ficha.saving} onSave={() => ficha.save()} onDiscard={ficha.discard} />
    </FichaLayout>
    </m.div>
  );
}
