'use client';

import { useState, useEffect, useMemo, startTransition } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import { formatRelativeTime } from '@/lib/relativeTime';
import { getProjectHref } from '@/lib/project-url';
import { slugify } from '@/lib/slug';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE } from '@/lib/project-types';
import type { ProjectType, ProjectSaleMode } from '@/types';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  location: string | null;
  masterplan_image: string | null;
  project_type: ProjectType;
  sale_mode: ProjectSaleMode;
  published: boolean;
  updated_at: string;
  pendingLeadsCount: number;
  commentsCount: number;
  progress: { done: number; total: number };
}

type Filter = 'all' | ProjectSaleMode | 'draft';
type Sort = 'recent' | 'name' | 'progress';
const SORT_LABELS: Record<Sort, string> = { recent: 'Más recientes', name: 'Nombre A-Z', progress: 'Más completos' };
const SORT_CYCLE: Sort[] = ['recent', 'name', 'progress'];

export default function MisProyectosPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const toast = useToast();

  const load = () => {
    startTransition(() => setLoading(true));
    fetch('/api/admin/projects')
      .then(res => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((data: { projects: ProjectRow[]; activeProjectId: string | null }) => {
        setProjects(data.projects);
        setActiveProjectId(data.activeProjectId);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.message === '401') { window.location.href = '/admin/login'; return; }
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(load, []);

  const setActiveProject = async (id: string) => {
    const res = await fetch('/api/admin/active-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id }),
    });
    return res.ok;
  };

  const enterProject = (id: string) => {
    setSelectingId(id);
    setActiveProject(id).then(ok => {
      if (ok) {
        window.location.href = '/admin'; // fuerza reload para que las rutas API lean la cookie nueva
      } else {
        setSelectingId(null);
        toast('No se pudo entrar a ese proyecto.', 'error');
      }
    });
  };

  const handleDuplicate = async (p: ProjectRow) => {
    setMenuOpenId(null);
    setDuplicatingId(p.id);
    const res = await fetch(`/api/admin/projects/${p.id}/duplicate`, { method: 'POST' });
    setDuplicatingId(null);
    if (res.ok) {
      toast('Proyecto duplicado.');
      load();
    } else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo duplicar el proyecto.', 'error');
    }
  };

  const q = query.trim().toLowerCase();
  const visible = useMemo(() => {
    let list = (projects ?? []).filter(p => {
      if (q && !`${p.name} ${p.location ?? ''}`.toLowerCase().includes(q)) return false;
      if (filter === 'draft') return !p.published;
      if (filter === 'venta' || filter === 'showcase') return p.sale_mode === filter;
      return true;
    });
    if (sort === 'name') list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'progress') list = [...list].sort((a, b) => (b.progress.done / (b.progress.total || 1)) - (a.progress.done / (a.progress.total || 1)));
    return list;
  }, [projects, q, filter, sort]);

  const chips: { key: Filter; label: string }[] = [
    { key: 'all', label: 'Todos' },
    { key: 'venta', label: PROJECT_SALE_MODES.venta.label },
    { key: 'showcase', label: PROJECT_SALE_MODES.showcase.label },
    { key: 'draft', label: 'Sin publicar' },
  ];

  if (loading) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-10 sm:py-12">
        <div className="flex items-end justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mis proyectos</h1>
            <p className="text-sm text-gray-500 mt-1.5">
              {projects && projects.length > 0
                ? `${projects.length} proyecto${projects.length === 1 ? '' : 's'} · seguí cargando el que quedó a medias o creá uno nuevo.`
                : 'Todavía no tenés proyectos.'}
            </p>
          </div>
          <button
            type="button" onClick={() => setWizardOpen(true)}
            className="shrink-0 h-[38px] px-4 flex items-center gap-2 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            <span className="text-base leading-none">+</span> Nuevo proyecto
          </button>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap mt-5">
          <div className="relative w-64 shrink-0">
            <input
              value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Buscar en mis proyectos"
              className="h-[34px] w-full pl-8 pr-3 text-xs rounded-lg border border-gray-200 bg-white outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            <span className="absolute left-2.5 top-1.5 text-gray-400 text-xs">⌕</span>
          </div>
          {chips.map(c => (
            <button
              key={c.key} type="button" onClick={() => setFilter(c.key)}
              className={`h-[30px] px-3 rounded-lg text-[11.5px] font-medium border transition-colors whitespace-nowrap ${
                filter === c.key ? 'bg-brand-50 border-brand-500 text-brand-800' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {c.label}
            </button>
          ))}
          <div className="flex-1" />
          <button
            type="button" onClick={() => setSort(SORT_CYCLE[(SORT_CYCLE.indexOf(sort) + 1) % SORT_CYCLE.length])}
            className="h-[30px] px-3 flex items-center gap-1.5 border border-gray-200 rounded-lg text-[11.5px] text-gray-600 bg-white hover:border-gray-300 transition-colors whitespace-nowrap"
          >
            {SORT_LABELS[sort]}
          </button>
        </div>

        <div className="grid gap-4 mt-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {visible.map(p => {
            const isActive = p.id === activeProjectId;
            const isBusy = selectingId !== null || deleteTarget !== null || duplicatingId !== null;
            const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
            const config = PROJECT_STRUCTURES[p.project_type];
            return (
              <div
                key={p.id}
                role="button" tabIndex={0}
                onClick={() => { if (!isBusy) enterProject(p.id); }}
                onKeyDown={e => { if (!isBusy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enterProject(p.id); } }}
                aria-disabled={isBusy}
                className={`relative text-left bg-white rounded-2xl overflow-visible cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border ${
                  isBusy ? 'opacity-50 pointer-events-none' : ''
                } ${isActive ? 'border-brand-400' : 'border-gray-200'}`}
              >
                <div className="relative h-[132px] rounded-t-[15px] overflow-hidden bg-gray-100">
                  {p.masterplan_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.masterplan_image} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                      <span className="text-2xl">🏗️</span>
                      <span className="text-[9.5px] text-gray-400">Sin portada — subila para publicar</span>
                    </div>
                  )}
                  <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                    <span className={`h-[21px] px-2 flex items-center rounded-md text-[10px] font-medium ${
                      p.published ? 'bg-gray-900/85 text-white' : 'bg-white/95 text-gray-700 border border-gray-200'
                    }`}>
                      {p.published ? 'Publicado' : 'Borrador'}
                    </span>
                    {isActive && (
                      <span className="h-[21px] px-2 flex items-center gap-1 rounded-md bg-brand-500 text-[10px] font-medium text-white">
                        <span className="w-[5px] h-[5px] rounded-full bg-white" /> Activo
                      </span>
                    )}
                    {p.pendingLeadsCount > 0 && (
                      <span className="h-[21px] px-2 flex items-center rounded-md bg-red-500 text-[10px] font-bold text-white">
                        {p.pendingLeadsCount} lead{p.pendingLeadsCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button" onClick={e => { e.stopPropagation(); setMenuOpenId(m => (m === p.id ? null : p.id)); }}
                    disabled={isBusy}
                    className="absolute top-2 right-2.5 w-[26px] h-[26px] rounded-lg bg-white/90 border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-white hover:text-gray-900 transition-colors"
                  >
                    ⋯
                  </button>
                  {menuOpenId === p.id && (
                    <div
                      onClick={e => e.stopPropagation()}
                      className="absolute top-10 right-2.5 w-[172px] bg-white border border-gray-200 rounded-xl shadow-[0_16px_34px_-14px_rgba(16,24,40,.3)] p-1.5 z-10"
                    >
                      <button type="button" onClick={() => { setMenuOpenId(null); enterProject(p.id); }} className="w-full text-left h-[30px] px-2.5 rounded-lg text-xs text-gray-900 hover:bg-gray-100">Seguir cargando</button>
                      <a href={getProjectHref(p.slug)} target="_blank" rel="noreferrer" onClick={() => setMenuOpenId(null)} className="block w-full text-left h-[30px] leading-[30px] px-2.5 rounded-lg text-xs text-gray-900 hover:bg-gray-100">Ver sitio público</a>
                      <button type="button" onClick={() => handleDuplicate(p)} className="w-full text-left h-[30px] px-2.5 rounded-lg text-xs text-gray-900 hover:bg-gray-100">Duplicar</button>
                      <div className="h-px bg-gray-100 my-1 mx-1.5" />
                      <button type="button" onClick={() => { setMenuOpenId(null); setDeleteTarget(p); }} className="w-full text-left h-[30px] px-2.5 rounded-lg text-xs text-red-600 hover:bg-red-50">Eliminar proyecto</button>
                    </div>
                  )}
                </div>

                <div className="p-4 flex flex-col gap-2.5">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-[15px] truncate">{p.name}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{p.location || 'Sin ubicación cargada'}</p>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="h-[22px] px-2.5 flex items-center rounded-md bg-gray-100 text-[10.5px] font-medium text-gray-700">{config?.label ?? p.project_type}</span>
                    <span className={`h-[22px] px-2.5 flex items-center rounded-md text-[10.5px] font-medium ${
                      p.sale_mode === 'venta' ? 'bg-brand-50 text-brand-800' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {PROJECT_SALE_MODES[p.sale_mode]?.label ?? p.sale_mode}
                    </span>
                  </div>
                  {p.progress.total > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between gap-2">
                        <span className="text-[10.5px] text-gray-500">{p.progress.done} de {p.progress.total} secciones listas</span>
                        <span className="text-[10.5px] font-medium text-gray-400">{pct}%</span>
                      </div>
                      <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-brand-500' : 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <span className="text-[10.5px] text-gray-400">Editado {formatRelativeTime(p.updated_at)}</span>
                    <span className="text-[11px] font-medium text-brand-600">{p.progress.done === p.progress.total ? 'Abrir' : 'Seguir cargando'} →</span>
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button" onClick={() => setWizardOpen(true)}
            className="min-h-[236px] border-[1.5px] border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-white/50 hover:bg-white hover:border-brand-500 transition-colors"
          >
            <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center text-lg">+</span>
            <span className="text-sm font-medium text-gray-900">Nuevo proyecto</span>
            <span className="text-[11px] text-gray-500 text-center max-w-[210px] leading-relaxed">Elegís la forma del desarrollo y el nombre. El resto se carga después.</span>
          </button>
        </div>

        {visible.length === 0 && (projects ?? []).length > 0 && (
          <div className="mt-4 p-11 bg-white border border-gray-200 rounded-2xl flex flex-col items-center gap-2">
            <p className="text-sm font-medium text-gray-900">Ningún proyecto coincide con esa búsqueda</p>
            <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="text-sm font-medium text-brand-600 hover:text-brand-700">
              Ver todos mis proyectos
            </button>
          </div>
        )}
      </div>

      {wizardOpen && (
        <NewProjectWizard
          onClose={() => setWizardOpen(false)}
          onCreated={async (id) => {
            const ok = await setActiveProject(id);
            if (!ok) { toast('No se pudo activar el proyecto nuevo.', 'error'); return; }
            window.location.href = '/admin/wizard'; // fuerza reload para que las rutas API lean la cookie nueva
          }}
        />
      )}

      <DeleteProjectModal
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); load(); }}
      />
    </div>
  );
}

function NewProjectWizard({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [form, setForm] = useState({
    name: '',
    projectType: DEFAULT_PROJECT_TYPE as ProjectType,
    saleMode: DEFAULT_SALE_MODE as ProjectSaleMode,
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const ready = form.name.trim().length > 1;
  const structure = PROJECT_STRUCTURES[form.projectType];

  const handleCreate = async () => {
    if (!ready || creating) return;
    setError('');
    setCreating(true);
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      onCreated(created.id);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al crear el proyecto.');
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/50 flex items-start justify-center p-5 py-10 overflow-y-auto z-[300]" onClick={onClose}>
      <div className="w-full max-w-[660px] bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <p className="text-lg font-semibold text-gray-900">Nuevo proyecto</p>
            <p className="text-xs text-gray-500 mt-1">Dos decisiones y el nombre. Todo lo demás se edita después.</p>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-900 transition-colors">✕</button>
        </div>

        <div className="px-6 pt-5">
          <p className="text-[11.5px] font-semibold text-gray-900">¿Qué forma tiene el desarrollo?</p>
          <p className="text-[10.5px] text-gray-500 mt-0.5">Define qué vas a poder cargar: unidades, lotes o espacios.</p>
          <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {(Object.entries(PROJECT_STRUCTURES) as [ProjectType, typeof PROJECT_STRUCTURES[ProjectType]][]).map(([key, config]) => {
              const on = form.projectType === key;
              return (
                <button
                  type="button" key={key}
                  onClick={() => setForm(f => ({
                    ...f, projectType: key,
                    saleMode: config.allowedSaleModes.includes(f.saleMode) ? f.saleMode : config.allowedSaleModes[0],
                  }))}
                  className={`text-left p-3 rounded-xl border transition-colors ${on ? 'border-brand-500 bg-brand-50/60' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full border-[1.5px] shrink-0 ${on ? 'border-brand-500 bg-brand-500 shadow-[inset_0_0_0_2.5px_#fff]' : 'border-gray-300'}`} />
                    <span className="text-xs font-medium text-gray-900">{config.label}</span>
                  </div>
                  <p className="text-[10.5px] text-gray-500 mt-1 leading-snug">{config.description}</p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-6 pt-5">
          <p className="text-[11.5px] font-semibold text-gray-900">¿Es para vender o solo para mostrar?</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            {(Object.entries(PROJECT_SALE_MODES) as [ProjectSaleMode, typeof PROJECT_SALE_MODES[ProjectSaleMode]][])
              .filter(([key]) => structure.allowedSaleModes.includes(key))
              .map(([key, config]) => {
                const on = form.saleMode === key;
                return (
                  <button
                    type="button" key={key}
                    onClick={() => setForm(f => ({ ...f, saleMode: key }))}
                    className={`flex-1 min-w-[200px] text-left p-3 rounded-xl border transition-colors ${on ? 'border-brand-500 bg-brand-50/60' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <p className="text-xs font-medium text-gray-900">{config.label}</p>
                    <p className="text-[10.5px] text-gray-500 mt-1 leading-snug">{config.description}</p>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="px-6 pt-5 pb-5">
          <p className="text-[11.5px] font-semibold text-gray-900">Nombre del proyecto</p>
          <input
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Ej: Loteo Zona Sur" autoFocus
            className="w-full h-[38px] mt-2 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
          />
          <p className="text-[11px] text-gray-500 mt-2 flex items-center gap-1.5">
            <span>Tu link:</span>
            <span className="font-medium text-brand-600 font-mono">arq360.com/{slugify(form.name) || 'mi-proyecto'}</span>
          </p>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[11px] text-gray-500">{structure.label} · {PROJECT_SALE_MODES[form.saleMode].label}{ready ? '' : ' · falta el nombre'}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 px-3.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-900 hover:border-gray-300 transition-colors">Cancelar</button>
            <button
              type="button" onClick={handleCreate} disabled={!ready || creating}
              className="h-9 px-4 rounded-lg text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
            >
              {creating ? 'Creando...' : 'Crear proyecto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
