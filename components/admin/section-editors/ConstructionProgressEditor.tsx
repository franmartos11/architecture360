'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fieldClass } from '@/components/admin/panel-ui';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import {
  SUGGESTED_STAGES, constructionMonth, currentStageIndex, formatUpdateDate, latestUpdate, newProgressId, suggestedStages,
} from '@/lib/construction-progress';
import {
  editableProgress, forSave, localToday, monthTitle, readSaveResponse, setDraft, upsertEntry, type SaveOutcome,
} from '@/lib/construction-progress-editor';
import StagesEditor from '@/components/admin/construction-progress/StagesEditor';
import Logbook from '@/components/admin/construction-progress/Logbook';
import QuickEntryDialog from '@/components/admin/construction-progress/QuickEntryDialog';
import ConflictNotice from '@/components/admin/construction-progress/ConflictNotice';
import type { ConstructionProgress, ConstructionStage, ConstructionUpdate, ProjectType } from '@/types';

// Editor del avance de obra — vive en /admin/proyecto/avance y en el panel
// de Secciones (/admin/sitio). Todo lo maneja el admin: las etapas son
// libres (nombre, orden, fechas, cuántas), y el porcentaje, la entrega, el
// inicio y la etapa actual son opcionales. Se guarda entero de una vez
// (PATCH constructionProgress) con control de conflicto: se manda el
// updatedAt con el que se cargó y, si otra persona guardó en el medio, la
// ruta contesta 409 y acá se ofrece recargar — nunca se reintenta a ciegas.
//
// Las piezas grandes viven en components/admin/construction-progress/*:
// la carga rápida (QuickEntryDialog), la bitácora (Logbook), las etapas
// (StagesEditor) y los campos de una entrada (EntryFields).

const VIEW_SUGGESTIONS = ['Frente', 'Dron', 'Contrafrente', 'Interior', 'Calle'];

type Updater = ConstructionProgress | ((cur: ConstructionProgress) => ConstructionProgress);

export default function ConstructionProgressEditor({ onSaved, header }: {
  onSaved: () => void;
  /** Encabezado de la pantalla, que recibe el botón "+ Nueva entrada" para ponerlo en sus acciones. */
  header?: (newEntryButton: ReactNode) => ReactNode;
}) {
  const contentIn = useContentIn();
  const [progress, setProgress] = useState<ConstructionProgress | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>('edificio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  // Abiertas para editar en el lugar. Las entradas nuevas entran por el
  // diálogo, así que la lista arranca toda resumida.
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editSummary, setEditSummary] = useState(false);
  // El diálogo se vuelve a montar en cada apertura (key) para arrancar en blanco.
  const [quick, setQuick] = useState<{ open: boolean; key: number }>({ open: false, key: 0 });
  // Entradas con fotos o clip subiendo: no se guarda hasta que terminen.
  const [uploadingIds, setUploadingIds] = useState<Set<string>>(new Set());
  // "Hoy" se fija al montar: no se llama a Date en cada render.
  const [today] = useState(localToday);
  // Cuenta de ediciones, para saber si algo cambió mientras se guardaba
  // (en ese caso, después del guardado, sigue habiendo cambios sin guardar).
  const edits = useRef(0);
  const toast = useToast();
  const confirm = useConfirm();
  const activeProjectId = useActiveProjectId();

  const fetchProgress = useCallback(async () => {
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId));
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    return { progress: editableProgress(data.project?.construction_progress), type: (data.project?.project_type as ProjectType) ?? 'edificio' };
  }, [activeProjectId]);

  useEffect(() => {
    let cancelled = false;
    fetchProgress()
      .then(({ progress: p, type }) => {
        if (cancelled) return;
        setProgress(p);
        setProjectType(type);
        setLoading(false);
        // Desde la tarjeta del dashboard ("Cargar la de este mes") se llega
        // con ?nueva=1: se abre directo la carga rápida. Se limpia la URL
        // para que recargar la página no la vuelva a abrir.
        const url = new URL(window.location.href);
        if (url.searchParams.has('nueva')) {
          url.searchParams.delete('nueva');
          window.history.replaceState(window.history.state, '', url);
          setQuick(q => ({ open: true, key: q.key + 1 }));
        }
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchProgress]);

  // Ángulos ya usados primero (para repetir siempre el mismo nombre y que
  // el time-lapse los agrupe), después las sugerencias.
  const viewOptions = useMemo(() => {
    const used = (progress?.updates ?? []).map(u => u.view).filter((v): v is string => !!v);
    return [...new Set([...used, ...VIEW_SUGGESTIONS])];
  }, [progress]);

  if (loading) return <EditorSkeleton rows={4} padded={false} />;
  if (!progress) {
    return <p className="m-0 text-sm text-gray-600">No se pudo cargar el avance de obra. Probá recargar la página.</p>;
  }

  // Funcional siempre: una foto que termina de subir llama con lo que había
  // cuando empezó, y no puede pisar lo que se tipeó mientras tanto.
  const change = (next: Updater) => {
    edits.current += 1;
    setProgress(cur => (cur ? (typeof next === 'function' ? next(cur) : next) : cur));
    setDirty(true);
  };

  // ── Guardado ──
  const save = async (next: ConstructionProgress): Promise<SaveOutcome> => {
    const at = edits.current;
    setSaving(true);
    let outcome: SaveOutcome;
    try {
      const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ constructionProgress: forSave(next), constructionProgressBase: next.updatedAt ?? null }),
      });
      outcome = readSaveResponse(res.status, await res.json().catch(() => null));
    } catch {
      outcome = { kind: 'error', message: 'Sin conexión: no se pudo guardar. Probá de nuevo.' };
    }
    setSaving(false);
    if (outcome.kind === 'ok') {
      const { updatedAt } = outcome;
      // Solo la marca nueva: si se siguió editando durante el guardado, eso
      // queda (y sigue "sin guardar"); la próxima vez se manda con esta base.
      setProgress(cur => (cur ? { ...cur, updatedAt } : cur));
      if (edits.current === at) setDirty(false);
      setConflict(null);
      onSaved();
    } else if (outcome.kind === 'conflict') {
      setConflict(outcome.message);
      toast(outcome.message, 'error');
    } else {
      toast(outcome.message, 'error');
    }
    return outcome;
  };

  const handleSave = async () => {
    const outcome = await save(progress);
    if (outcome.kind === 'ok') toast('Guardado.');
  };

  // Recargar descarta lo local (lo que chocó) y trae lo que guardó el otro.
  const reload = async () => {
    setReloading(true);
    try {
      const { progress: fresh } = await fetchProgress();
      edits.current += 1;
      setProgress(fresh);
      setDirty(false);
      setConflict(null);
      setOpen(new Set());
      toast('Recargado con lo último guardado.');
    } catch {
      toast('No se pudo recargar. Probá de nuevo.', 'error');
    } finally {
      setReloading(false);
    }
  };

  // ── Carga rápida ──
  const openQuick = () => setQuick(q => ({ open: true, key: q.key + 1 }));
  const submitQuick = async (entry: ConstructionUpdate, draft: boolean) => {
    const next = upsertEntry(progress, entry, draft);
    change(next);
    const outcome = await save(next);
    if (outcome.kind === 'ok') toast(draft ? 'Borrador guardado.' : 'Entrada publicada.');
    // Con error común la entrada ya está en la bitácora y queda la barra de
    // "Guardar cambios" para reintentar: se cierra el diálogo. Con conflicto
    // queda abierto, con la entrada, para recargar y volver a mandarla.
    return outcome.kind !== 'conflict';
  };

  // ── Etapas ──
  const setStages = (stages: ConstructionStage[]) => change(cur => {
    const ids = new Set(stages.map(s => s.id));
    return {
      ...cur,
      stages,
      // Borrar una etapa suelta las referencias a ella (no deja ids huérfanos).
      currentStageId: cur.currentStageId && ids.has(cur.currentStageId) ? cur.currentStageId : undefined,
      updates: cur.updates.map(u => (u.stageId && !ids.has(u.stageId) ? { ...u, stageId: undefined } : u)),
    };
  });

  // ── Entradas ──
  const patchUpdate = (id: string, patch: Partial<ConstructionUpdate>) =>
    change(cur => ({ ...cur, updates: cur.updates.map(u => (u.id === id ? { ...u, ...patch } : u)) }));
  const removeUpdate = async (u: ConstructionUpdate) => {
    const ok = await confirm({
      title: 'Borrar actualización',
      message: `Se borra "${u.title || formatUpdateDate(u.date)}" con sus fotos del avance de obra.`,
      confirmLabel: 'Borrar',
      danger: true,
    });
    if (ok) change(cur => ({ ...cur, updates: cur.updates.filter(x => x.id !== u.id) }));
  };
  const toggleOpen = (id: string) => setOpen(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const markUploading = (id: string, v: boolean) => setUploadingIds(prev => {
    if (prev.has(id) === v) return prev;
    const next = new Set(prev);
    if (v) next.add(id); else next.delete(id);
    return next;
  });
  const uploading = uploadingIds.size > 0;

  const currentIdx = currentStageIndex(progress);
  const lastUpdate = latestUpdate(progress, { includeDrafts: true });
  const monthNumber = constructionMonth(progress, today);

  const newEntryButton = (
    <button type="button" onClick={openQuick}
      className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-brand-700 text-white text-sm font-semibold hover:bg-brand-800">
      <span aria-hidden className="text-base leading-none">+</span> Nueva entrada · {monthTitle(today)}
    </button>
  );

  return (
    <m.div {...contentIn} className="flex flex-col gap-8">
      {header ? header(newEntryButton) : <div className="flex justify-end">{newEntryButton}</div>}

      {conflict && !quick.open && (
        <ConflictNotice message={conflict} onReload={reload} reloading={reloading}
          detail="Al recargar se descartan los cambios que tenías sin guardar acá." />
      )}

      {/* ── Resumen: % general, entrega, inicio y etapas ── */}
      <section aria-label="Resumen de obra" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-5">
        <div className="flex items-end justify-between gap-x-6 gap-y-2 flex-wrap">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-display text-[44px] sm:text-[52px] leading-none font-semibold text-gray-900">
              {progress.percent != null ? `${progress.percent}%` : '—'}
            </span>
            <span className="text-sm text-gray-600">
              de avance general · entrega estimada <b className="text-gray-900">{progress.deliveryEstimate || '[mes / año]'}</b>
              {progress.startedAt && (
                <> · inicio de obra <b className="text-gray-900">{formatUpdateDate(progress.startedAt)}</b>{monthNumber != null && ` (mes ${monthNumber})`}</>
              )}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdate && <span className="text-xs text-gray-500">Última entrada: {formatUpdateDate(lastUpdate.date)}</span>}
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
                  {(st.from || st.to) && (
                    <span className="text-[11px] text-gray-500">
                      {st.from ? formatUpdateDate(st.from) : '…'} – {st.to ? formatUpdateDate(st.to) : '…'}
                    </span>
                  )}
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
                    onChange={e => { const on = e.target.checked; change(cur => ({ ...cur, percent: on ? (cur.percent ?? 0) : undefined })); }}
                    className="w-4 h-4 accent-brand-700" />
                  Mostrar porcentaje de avance
                </label>
                {progress.percent != null && (
                  <div className="flex items-center gap-3">
                    <input type="range" min={0} max={100} step={1} value={progress.percent}
                      onChange={e => { const v = Number(e.target.value); change(cur => ({ ...cur, percent: v })); }}
                      className="flex-1 accent-brand-700" aria-label="Porcentaje de avance" />
                    <span className="flex items-center min-h-[40px] w-20 rounded-[9px] border border-gray-300 bg-white overflow-hidden">
                      <input type="number" min={0} max={100} value={progress.percent}
                        onChange={e => { const v = Math.max(0, Math.min(100, Number(e.target.value) || 0)); change(cur => ({ ...cur, percent: v })); }}
                        aria-label="Porcentaje de avance (número)" className="w-full px-2 text-sm text-right outline-none" />
                      <span className="pr-2 text-xs text-gray-500">%</span>
                    </span>
                  </div>
                )}
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Entrega estimada</span>
                <input value={progress.deliveryEstimate ?? ''} maxLength={80}
                  onChange={e => { const v = e.target.value || undefined; change(cur => ({ ...cur, deliveryEstimate: v })); }}
                  placeholder="Diciembre 2027 · Posesión desde junio…" className={fieldClass} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-gray-700">Inicio de obra (opcional)</span>
                <input type="date" value={progress.startedAt ?? ''}
                  onChange={e => { const v = e.target.value || undefined; change(cur => ({ ...cur, startedAt: v })); }}
                  className={fieldClass} />
                <span className="text-[11px] text-gray-500">Con esto el sitio puede decir &quot;mes N de obra&quot;.</span>
              </label>
              {progress.stages.length > 0 && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-gray-700">Etapa en curso</span>
                  <select value={progress.currentStageId ?? ''} onChange={e => { const v = e.target.value || undefined; change(cur => ({ ...cur, currentStageId: v })); }} className={fieldClass}>
                    <option value="">La de la última entrada</option>
                    {progress.stages.map(st => <option key={st.id} value={st.id}>{st.label || 'Sin nombre'}</option>)}
                  </select>
                </label>
              )}
            </div>
            {progress.stages.length > 0 && <StagesEditor stages={progress.stages} onChange={setStages} />}
          </div>
        )}
      </section>

      <Logbook
        progress={progress}
        today={today}
        open={open}
        onToggleOpen={toggleOpen}
        onPatch={patchUpdate}
        onSetDraft={(id, draft) => change(cur => setDraft(cur, id, draft))}
        onRemove={removeUpdate}
        onNewEntry={openQuick}
        viewOptions={viewOptions}
        onUploadingChange={markUploading}
      />

      {(dirty || saving) && !quick.open && (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-[14px] bg-gray-900 text-white shadow-[0_12px_32px_-12px_rgba(23,25,26,0.4)]">
          <span className="text-[13px] text-[#E4E0D8]">
            {uploading ? 'Esperando que terminen de subir las fotos…' : 'Cambios sin guardar en la obra'}
          </span>
          <button type="button" onClick={handleSave} disabled={saving || uploading || conflict != null}
            className="min-h-[40px] px-4 rounded-lg bg-white text-gray-900 text-sm font-semibold disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}

      <QuickEntryDialog
        key={quick.key}
        open={quick.open}
        onClose={() => setQuick(q => ({ ...q, open: false }))}
        progress={progress}
        today={today}
        viewOptions={viewOptions}
        onSubmit={submitQuick}
        conflict={conflict}
        onReload={reload}
        reloading={reloading}
      />
    </m.div>
  );
}
