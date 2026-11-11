'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { fieldClass } from '@/components/admin/panel-ui';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Collapse from '@/components/ui/Collapse';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import {
  MAX_IMAGES_PER_UPDATE, MAX_STAGES, SUGGESTED_STAGES, currentStageIndex, emptyProgress, formatUpdateDate, newProgressId, suggestedStages,
} from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionStage, ConstructionUpdate, ProjectType } from '@/types';

// Editor del avance de obra — vive en /admin/proyecto/avance y en el panel
// de Secciones (/admin/sitio). Todo lo maneja el admin: las etapas son
// libres (nombre, orden, cuántas), y el porcentaje, la entrega y la etapa
// actual son opcionales. Se guarda entero de una vez (PATCH
// constructionProgress), igual que Antes/Después.

const VIEW_SUGGESTIONS = ['Frente', 'Dron', 'Contrafrente', 'Interior', 'Calle'];
const today = () => new Date().toISOString().slice(0, 10);
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
/** "Noviembre 2026" — encabezado de cada mes en la bitácora. */
const monthTitle = (iso: string) => {
  const [y, m] = iso.split('-').map(Number);
  return y ? `${MONTH_NAMES[(m || 1) - 1]} ${y}` : '';
};

export default function ConstructionProgressEditor({ onSaved, header }: {
  onSaved: () => void;
  /** Encabezado de la pantalla, que recibe el botón "+ Nueva entrada" para ponerlo en sus acciones. */
  header?: (newEntryButton: ReactNode) => ReactNode;
}) {
  const [progress, setProgress] = useState<ConstructionProgress | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>('edificio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Abiertas para editar: las nuevas y la más reciente al cargar. Las viejas
  // quedan resumidas en una línea para que la lista no se haga eterna.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editSummary, setEditSummary] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => {
        const saved = data.project?.construction_progress as ConstructionProgress | null | undefined;
        const p: ConstructionProgress = saved && typeof saved === 'object'
          ? { ...emptyProgress(), ...saved, stages: saved.stages ?? [], updates: saved.updates ?? [] }
          : emptyProgress();
        setProgress(p);
        setProjectType((data.project?.project_type as ProjectType) ?? 'edificio');
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [activeProjectId]);

  // Ángulos ya usados primero (para repetir siempre el mismo nombre y que
  // el time-lapse los agrupe), después las sugerencias.
  const viewOptions = useMemo(() => {
    const used = (progress?.updates ?? []).map(u => u.view).filter((v): v is string => !!v);
    return [...new Set([...used, ...VIEW_SUGGESTIONS])];
  }, [progress]);

  if (loading || !progress) return <LoadingSpinner text="Cargando..." tone="light" />;

  const change = (next: ConstructionProgress) => { setProgress(next); setDirty(true); };

  // ── Etapas ──
  const setStages = (stages: ConstructionStage[]) => {
    const ids = new Set(stages.map(s => s.id));
    change({
      ...progress,
      stages,
      // Borrar una etapa suelta las referencias a ella (no deja ids huérfanos).
      currentStageId: progress.currentStageId && ids.has(progress.currentStageId) ? progress.currentStageId : undefined,
      updates: progress.updates.map(u => (u.stageId && !ids.has(u.stageId) ? { ...u, stageId: undefined } : u)),
    });
  };
  const moveStage = (i: number, d: number) => {
    const next = [...progress.stages];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setStages(next);
  };

  // ── Actualizaciones ──
  const setUpdate = (id: string, patch: Partial<ConstructionUpdate>) =>
    change({ ...progress, updates: progress.updates.map(u => (u.id === id ? { ...u, ...patch } : u)) });
  const addUpdate = () => {
    const id = newProgressId();
    // Etapa por defecto: la actual, o la de la última actualización.
    const lastStage = progress.currentStageId ?? [...progress.updates].sort((a, b) => b.date.localeCompare(a.date))[0]?.stageId;
    change({ ...progress, updates: [{ id, date: today(), title: '', images: [], stageId: lastStage }, ...progress.updates] });
    setOpen(prev => new Set(prev).add(id));
  };
  const removeUpdate = async (u: ConstructionUpdate) => {
    const ok = await confirm({
      title: 'Borrar actualización',
      message: `Se borra "${u.title || formatUpdateDate(u.date)}" con sus fotos del avance de obra.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (ok) change({ ...progress, updates: progress.updates.filter(x => x.id !== u.id) });
  };
  const toggleOpen = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ constructionProgress: progress }),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      toast('Guardado.');
      onSaved();
    } else {
      const err = await res.json().catch(() => null);
      // Base sin la columna nueva (falta correr supabase/schema.sql).
      const missingColumn = typeof err?.error === 'string' && err.error.includes('construction_progress');
      toast(missingColumn ? 'Falta actualizar la base de datos (columna construction_progress).' : 'Error al guardar.', 'error');
    }
  };

  const stageName = (id?: string) => progress.stages.find(s => s.id === id)?.label;
  const currentIdx = currentStageIndex(progress);
  // Lo más nuevo arriba, como una bitácora.
  const timeline = [...progress.updates].sort((a, b) => b.date.localeCompare(a.date));
  const lastUpdate = timeline[0];
  const monthNow = today().slice(0, 7);
  const hasThisMonth = progress.updates.some(u => u.date.slice(0, 7) === monthNow);
  const monthLabel = monthTitle(today());

  const newEntryButton = (
    <button type="button" onClick={addUpdate}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800">
      <span aria-hidden className="text-base leading-none">+</span> Nueva entrada · {monthLabel}
    </button>
  );

  return (
    <div className="flex flex-col gap-8">
      {header ? header(newEntryButton) : <div className="flex justify-end">{newEntryButton}</div>}

      {/* ── Resumen: % general, entrega y etapas ── */}
      <section aria-label="Resumen de obra" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-[44px] sm:text-[52px] leading-none font-semibold text-gray-900">
              {progress.percent != null ? `${progress.percent}%` : '—'}
            </span>
            <span className="text-sm text-gray-600">
              de avance general · entrega estimada <b className="text-gray-900">{progress.deliveryEstimate || '[mes / año]'}</b>
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && <span className="text-xs text-gray-500">Última actualización: {formatUpdateDate(lastUpdate.date)}</span>}
            <button type="button" onClick={() => setEditSummary(o => !o)} aria-expanded={editSummary}
              className="min-h-[36px] px-3 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-900 hover:border-gray-400">
              {editSummary ? 'Cerrar' : 'Editar'}
            </button>
          </div>
        </div>

        {progress.stages.length > 0 ? (
          <ol className="grid gap-3 m-0 p-0 list-none" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(min(140px, 100%), 1fr))` }}>
            {progress.stages.map((st, i) => {
              // Las etapas no tienen % propio: se muestran listas, en curso o pendientes según la etapa actual.
              const state = currentIdx < 0 ? 'pending' : i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending';
              return (
                <li key={st.id} className="flex flex-col gap-1.5 min-w-0">
                  <span className="h-1.5 rounded-full bg-[#EAE7E0] overflow-hidden" aria-hidden>
                    <span className={`block h-full rounded-full ${state === 'done' ? 'w-full bg-brand-700' : state === 'current' ? 'w-1/2 bg-brand-300' : 'w-0'}`} />
                  </span>
                  <span className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-semibold text-gray-900 truncate">{st.label || 'Sin nombre'}</span>
                    <span className="text-gray-500 shrink-0">{state === 'done' ? 'Lista' : state === 'current' ? 'En curso' : '—'}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-300 p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="m-0 text-sm text-gray-600">
              Sin etapas todavía. Arrancá con las sugeridas ({SUGGESTED_STAGES[projectType].join(', ')}) o creá las tuyas.
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <button type="button" onClick={() => { setStages(suggestedStages(projectType)); }} className="min-h-[40px] px-3.5 rounded-lg bg-gray-900 text-white text-[13px] font-semibold">Usar sugeridas</button>
              <button type="button" onClick={() => { setStages([{ id: newProgressId(), label: '' }]); setEditSummary(true); }} className="min-h-[40px] px-3.5 rounded-lg border border-gray-300 bg-white text-[13px] font-medium">Crear la primera</button>
            </div>
          </div>
        )}

        {editSummary && (
          <div className="flex flex-col gap-5 pt-5 border-t border-gray-200">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                  <input type="checkbox" checked={progress.percent != null}
                    onChange={e => change({ ...progress, percent: e.target.checked ? (progress.percent ?? 0) : undefined })}
                    className="w-4 h-4 accent-brand-700" />
                  Mostrar porcentaje de avance
                </label>
                {progress.percent != null && (
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={100} step={1} value={progress.percent}
                      onChange={e => change({ ...progress, percent: Number(e.target.value) })}
                      className="flex-1 accent-brand-700" aria-label="Porcentaje de avance" />
                    <span className="flex items-center min-h-[40px] w-20 rounded-[9px] border border-gray-300 bg-white overflow-hidden">
                      <input type="number" min={0} max={100} value={progress.percent}
                        onChange={e => change({ ...progress, percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                        aria-label="Porcentaje de avance (número)" className="w-full px-2 text-sm text-right outline-none" />
                      <span className="pr-2 text-xs text-gray-500">%</span>
                    </span>
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Entrega estimada</span>
                <input value={progress.deliveryEstimate ?? ''} maxLength={80}
                  onChange={e => change({ ...progress, deliveryEstimate: e.target.value || undefined })}
                  placeholder="Diciembre 2027 · Posesión desde junio…" className={fieldClass} />
              </label>
              {progress.stages.length > 0 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-700">Etapa en curso</span>
                  <select value={progress.currentStageId ?? ''} onChange={e => change({ ...progress, currentStageId: e.target.value || undefined })} className={fieldClass}>
                    <option value="">La de la última entrada</option>
                    {progress.stages.map(st => <option key={st.id} value={st.id}>{st.label || 'Sin nombre'}</option>)}
                  </select>
                </label>
              )}
            </div>
            {progress.stages.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-gray-700">Etapas, en el orden de la obra</span>
                <ol className="flex flex-col gap-2 m-0 p-0 list-none">
                  {progress.stages.map((st, i) => (
                    <li key={st.id} className="flex items-center gap-2">
                      <span className="w-6 shrink-0 text-xs text-gray-500 tabular-nums text-right">{i + 1}.</span>
                      <input value={st.label} maxLength={40} aria-label={`Etapa ${i + 1}`} placeholder="Nombre de la etapa"
                        onChange={e => setStages(progress.stages.map(x => (x.id === st.id ? { ...x, label: e.target.value } : x)))}
                        className={`${fieldClass} flex-1`} />
                      <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0} aria-label={`Subir ${st.label || 'etapa'}`} className="w-10 h-10 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30">↑</button>
                      <button type="button" onClick={() => moveStage(i, 1)} disabled={i === progress.stages.length - 1} aria-label={`Bajar ${st.label || 'etapa'}`} className="w-10 h-10 rounded-lg text-gray-600 hover:bg-gray-100 disabled:opacity-30">↓</button>
                      <button type="button" onClick={() => setStages(progress.stages.filter(x => x.id !== st.id))} aria-label={`Borrar ${st.label || 'etapa'}`} className="w-10 h-10 rounded-lg text-gray-500 hover:text-red-700 hover:bg-red-50">✕</button>
                    </li>
                  ))}
                </ol>
                {progress.stages.length < MAX_STAGES && (
                  <button type="button" onClick={() => setStages([...progress.stages, { id: newProgressId(), label: '' }])}
                    className="self-start min-h-[40px] text-[13px] font-semibold text-brand-700">+ Agregar etapa</button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Bitácora ── */}
      <section aria-label="Bitácora" className="flex flex-col gap-4">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">Bitácora</h2>
        <ol className="relative m-0 p-0 list-none flex flex-col gap-7 before:absolute before:left-[6px] before:top-2 before:bottom-2 before:w-px before:bg-gray-300">
          {!hasThisMonth && (
            <li className="relative pl-9 flex flex-col gap-3">
              <span aria-hidden className="absolute left-0 top-1.5 w-[13px] h-[13px] rounded-full border-2 border-gray-900 bg-[#F5F3EE]" />
              <div className="flex items-center gap-3 flex-wrap">
                <span className="font-display text-lg font-semibold text-gray-900">{monthLabel}</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">Borrador</span>
                <span className="text-[13px] text-gray-600">Arrastrá las fotos del mes</span>
              </div>
              <button type="button" onClick={addUpdate}
                className="w-[124px] h-[92px] rounded-xl border border-dashed border-gray-300 bg-white/50 text-xs text-gray-700 hover:border-gray-400">
                + Fotos
              </button>
            </li>
          )}
          {timeline.length === 0 && hasThisMonth && (
            <li className="pl-9 text-sm text-gray-500">Todavía no cargaste ninguna entrada.</li>
          )}
          {timeline.map(u => {
            const isOpen = open.has(u.id);
            const stage = stageName(u.stageId);
            return (
              <li key={u.id} className="relative pl-9 flex flex-col gap-3">
                <span aria-hidden className="absolute left-0 top-1.5 w-[13px] h-[13px] rounded-full bg-brand-700" />
                <button type="button" onClick={() => toggleOpen(u.id)} aria-expanded={isOpen} aria-controls={`obra-${u.id}`}
                  className="flex items-center gap-x-3 gap-y-1 flex-wrap text-left min-h-[32px]">
                  <span className="font-display text-lg font-semibold text-gray-900">{monthTitle(u.date)}</span>
                  {stage && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">{stage}</span>}
                  <span className="text-[13px] text-gray-700">{u.title || 'Sin título'}</span>
                  {u.images.length === 0 && <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Sin fotos no se ve</span>}
                  <span className="text-xs text-gray-500 underline underline-offset-2">{isOpen ? 'Cerrar' : 'Editar'}</span>
                </button>
                {u.images.length > 0 && !isOpen && (
                  <div className="flex gap-2 flex-wrap">
                    {u.images.slice(0, 6).map((src, i) => (
                      // eslint-disable-next-line @next/next/no-img-element -- miniatura del admin
                      <img key={i} src={src} alt="" className="w-[124px] h-[92px] rounded-xl object-cover border border-gray-200" />
                    ))}
                    {u.images.length > 6 && <span className="w-[124px] h-[92px] rounded-xl bg-gray-100 flex items-center justify-center text-sm text-gray-600">+{u.images.length - 6}</span>}
                  </div>
                )}
                <Collapse open={isOpen}>
                  <div id={`obra-${u.id}`} className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 flex flex-col gap-4">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-700">Fecha</span>
                        <input type="date" value={u.date} onChange={e => e.target.value && setUpdate(u.id, { date: e.target.value })} className={fieldClass} />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-700">Etapa</span>
                        <select value={u.stageId ?? ''} onChange={e => setUpdate(u.id, { stageId: e.target.value || undefined })} className={fieldClass}>
                          <option value="">Sin etapa</option>
                          {progress.stages.map(st => <option key={st.id} value={st.id}>{st.label || 'Sin nombre'}</option>)}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-gray-700">Ángulo de la foto (opcional)</span>
                        <input value={u.view ?? ''} list={`views-${u.id}`} maxLength={40} placeholder="Frente, Dron…"
                          onChange={e => setUpdate(u.id, { view: e.target.value || undefined })} className={fieldClass} />
                        <datalist id={`views-${u.id}`}>
                          {viewOptions.map(v => <option key={v} value={v} />)}
                        </datalist>
                      </label>
                    </div>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-700">Una línea</span>
                      <input value={u.title} maxLength={120} placeholder="Hormigonado de losa del piso 7."
                        onChange={e => setUpdate(u.id, { title: e.target.value })} className={fieldClass} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-gray-700">Texto (opcional)</span>
                      <textarea value={u.body ?? ''} maxLength={1000} placeholder="Lo que quieras contar de este mes."
                        onChange={e => setUpdate(u.id, { body: e.target.value || undefined })}
                        className={`${fieldClass} py-2.5 min-h-[84px] resize-y`} />
                    </label>
                    <MultiImageUploader
                      label={`Fotos (la primera es la portada · hasta ${MAX_IMAGES_PER_UPDATE})`}
                      values={u.images}
                      onChange={images => setUpdate(u.id, { images: images.slice(0, MAX_IMAGES_PER_UPDATE) })}
                      folder="construction"
                    />
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeUpdate(u)} className="min-h-[40px] px-3 rounded-lg text-[13px] font-medium text-red-700 hover:bg-red-50">Borrar entrada</button>
                    </div>
                  </div>
                </Collapse>
              </li>
            );
          })}
        </ol>
      </section>

      {(dirty || saving) && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-[14px] bg-gray-900 text-white shadow-[0_12px_32px_-12px_rgba(23,25,26,0.4)]">
          <span className="text-[13px] text-[#E4E0D8]">Cambios sin guardar en la obra</span>
          <button type="button" onClick={handleSave} disabled={saving}
            className="min-h-[40px] px-4 rounded-lg bg-white text-gray-900 text-sm font-semibold disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </div>
  );
}
