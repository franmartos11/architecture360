'use client';

import { useEffect, useMemo, useState } from 'react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import {
  MAX_IMAGES_PER_UPDATE, MAX_STAGES, SUGGESTED_STAGES, emptyProgress, formatUpdateDate, newProgressId, suggestedStages,
} from '@/lib/construction-progress';
import type { ConstructionProgress, ConstructionStage, ConstructionUpdate, ProjectType } from '@/types';

// Editor del avance de obra — vive en /admin/proyecto/avance y en el panel
// de Secciones (/admin/sitio). Todo lo maneja el admin: las etapas son
// libres (nombre, orden, cuántas), y el porcentaje, la entrega y la etapa
// actual son opcionales. Se guarda entero de una vez (PATCH
// constructionProgress), igual que Antes/Después.

const VIEW_SUGGESTIONS = ['Frente', 'Dron', 'Contrafrente', 'Interior', 'Calle'];
const today = () => new Date().toISOString().slice(0, 10);
const textareaClass = 'w-full px-4 py-2 border border-brand-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none transition-shadow text-sm resize-y min-h-[84px]';

export default function ConstructionProgressEditor({ onSaved }: { onSaved: () => void }) {
  const [progress, setProgress] = useState<ConstructionProgress | null>(null);
  const [projectType, setProjectType] = useState<ProjectType>('edificio');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  // Abiertas para editar: las nuevas y la más reciente al cargar. Las viejas
  // quedan resumidas en una línea para que la lista no se haga eterna.
  const [open, setOpen] = useState<Set<string>>(new Set());
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
        const newest = [...p.updates].sort((a, b) => b.date.localeCompare(a.date))[0];
        setOpen(new Set(newest ? [newest.id] : []));
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

  const sortedForDisplay = progress.updates; // nuevas arriba (addUpdate las pone primero)
  const stageName = (id?: string) => progress.stages.find(s => s.id === id)?.label;

  return (
    <div className="space-y-8">
      {/* ── Resumen ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Resumen</h3>
          <p className="text-sm text-gray-500 mt-0.5">Todo opcional: lo que dejes vacío no aparece en el sitio.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-medium text-brand-900">
              <input
                type="checkbox"
                checked={progress.percent != null}
                onChange={e => change({ ...progress, percent: e.target.checked ? (progress.percent ?? 0) : undefined })}
                className="w-4 h-4 accent-brand-900"
              />
              Mostrar porcentaje de avance
            </label>
            {progress.percent != null && (
              <div className="flex items-center gap-3">
                <input
                  type="range" min={0} max={100} step={1}
                  value={progress.percent}
                  onChange={e => change({ ...progress, percent: Number(e.target.value) })}
                  className="flex-1 accent-brand-900"
                  aria-label="Porcentaje de avance"
                />
                <div className="w-24 shrink-0 relative">
                  <Input
                    type="number" min={0} max={100}
                    value={progress.percent}
                    onChange={e => change({ ...progress, percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                    aria-label="Porcentaje de avance (número)"
                    className="pr-7"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                </div>
              </div>
            )}
          </div>
          <Input
            id="cp-delivery"
            label="Entrega estimada"
            value={progress.deliveryEstimate ?? ''}
            onChange={e => change({ ...progress, deliveryEstimate: e.target.value || undefined })}
            placeholder="Diciembre 2027 · Posesión desde junio…"
            maxLength={80}
          />
          {progress.stages.length > 0 && (
            <Select
              id="cp-current-stage"
              label="Etapa actual"
              value={progress.currentStageId ?? ''}
              onChange={e => change({ ...progress, currentStageId: e.target.value || undefined })}
            >
              <option value="">La de la última actualización</option>
              {progress.stages.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          )}
        </div>
      </section>

      {/* ── Etapas ── */}
      <section className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Etapas</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Las que quieras, con el nombre que quieras y en el orden de la obra. En el sitio se ven como una tira que se va completando.
          </p>
        </div>
        {progress.stages.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <p className="text-sm text-gray-500">
              Todavía no hay etapas. Podés arrancar con unas sugeridas ({SUGGESTED_STAGES[projectType].join(', ')}) y cambiarlas, o crear las tuyas.
            </p>
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button variant="secondary" onClick={() => setStages(suggestedStages(projectType))}>Usar sugeridas</Button>
              <Button variant="ghost" onClick={() => setStages([{ id: newProgressId(), label: '' }])}>Crear la primera</Button>
            </div>
          </div>
        ) : (
          <ol className="space-y-2">
            {progress.stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm text-gray-400 tabular-nums text-right">{i + 1}.</span>
                <div className="flex-1">
                  <Input
                    value={s.label}
                    onChange={e => setStages(progress.stages.map(x => (x.id === s.id ? { ...x, label: e.target.value } : x)))}
                    placeholder="Nombre de la etapa"
                    maxLength={40}
                    aria-label={`Etapa ${i + 1}`}
                  />
                </div>
                <button type="button" onClick={() => moveStage(i, -1)} disabled={i === 0} aria-label="Subir" className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">↑</button>
                <button type="button" onClick={() => moveStage(i, 1)} disabled={i === progress.stages.length - 1} aria-label="Bajar" className="w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30">↓</button>
                <button type="button" onClick={() => setStages(progress.stages.filter(x => x.id !== s.id))} className="px-2 h-9 text-sm text-red-500 hover:text-red-700">Borrar</button>
              </li>
            ))}
            {progress.stages.length < MAX_STAGES && (
              <li className="pl-8">
                <Button variant="ghost" size="sm" onClick={() => setStages([...progress.stages, { id: newProgressId(), label: '' }])}>+ Agregar etapa</Button>
              </li>
            )}
          </ol>
        )}
      </section>

      {/* ── Actualizaciones ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Actualizaciones</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Fotos con fecha de cómo va la obra. Para que el time-lapse luzca, sacalas siempre desde el mismo lugar y marcá el ángulo.
            </p>
          </div>
          <Button onClick={addUpdate}>+ Nueva actualización</Button>
        </div>

        {sortedForDisplay.length === 0 && (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-sm text-gray-400 text-center">
            Todavía no cargaste ninguna actualización.
          </p>
        )}

        <ul className="space-y-3">
          {sortedForDisplay.map(u => {
            const isOpen = open.has(u.id);
            return (
              <li key={u.id} className="rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleOpen(u.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 p-4 text-left"
                >
                  <span className="relative w-14 h-10 shrink-0 rounded-md overflow-hidden bg-gray-100">
                    {/* eslint-disable-next-line @next/next/no-img-element -- miniatura del admin, no vale la pena el optimizador */}
                    {u.images[0] && <img src={u.images[0]} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold text-gray-900 truncate">{u.title || 'Sin título'}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {[formatUpdateDate(u.date), stageName(u.stageId), `${u.images.length} ${u.images.length === 1 ? 'foto' : 'fotos'}`].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {u.images.length === 0 && <span className="hidden sm:inline text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded-md">Sin fotos no se ve</span>}
                  <svg className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 space-y-4 border-t border-gray-100">
                    <div className="grid gap-4 sm:grid-cols-3 pt-3">
                      <Input id={`cp-date-${u.id}`} label="Fecha" type="date" value={u.date} onChange={e => e.target.value && setUpdate(u.id, { date: e.target.value })} />
                      <Select id={`cp-stage-${u.id}`} label="Etapa" value={u.stageId ?? ''} onChange={e => setUpdate(u.id, { stageId: e.target.value || undefined })}>
                        <option value="">Sin etapa</option>
                        {progress.stages.map(s => <option key={s.id} value={s.id}>{s.label || 'Sin nombre'}</option>)}
                      </Select>
                      <div>
                        <Input
                          id={`cp-view-${u.id}`}
                          label="Ángulo de la foto (opcional)"
                          value={u.view ?? ''}
                          onChange={e => setUpdate(u.id, { view: e.target.value || undefined })}
                          placeholder="Frente, Dron…"
                          list={`views-${u.id}`}
                          maxLength={40}
                        />
                        <datalist id={`views-${u.id}`}>
                          {viewOptions.map(v => <option key={v} value={v} />)}
                        </datalist>
                      </div>
                    </div>
                    <Input
                      id={`cp-title-${u.id}`}
                      label="Título"
                      value={u.title}
                      onChange={e => setUpdate(u.id, { title: e.target.value })}
                      placeholder="Terminó la estructura, Llegó el agua…"
                      maxLength={120}
                    />
                    <div>
                      <label htmlFor={`body-${u.id}`} className="block text-sm font-medium text-brand-900 mb-1">Texto (opcional)</label>
                      <textarea
                        id={`body-${u.id}`}
                        value={u.body ?? ''}
                        onChange={e => setUpdate(u.id, { body: e.target.value || undefined })}
                        maxLength={1000}
                        placeholder="Lo que quieras contar de esta etapa."
                        className={textareaClass}
                      />
                    </div>
                    <MultiImageUploader
                      label={`Fotos (la primera es la portada · hasta ${MAX_IMAGES_PER_UPDATE})`}
                      values={u.images}
                      onChange={images => setUpdate(u.id, { images: images.slice(0, MAX_IMAGES_PER_UPDATE) })}
                      folder="construction"
                    />
                    <div className="flex justify-end">
                      <Button variant="danger" size="sm" onClick={() => removeUpdate(u)}>Borrar actualización</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white/90 backdrop-blur border-t border-gray-100 flex items-center justify-end gap-3">
        {dirty && <span className="text-sm text-gray-500">Cambios sin guardar</span>}
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </div>
    </div>
  );
}
