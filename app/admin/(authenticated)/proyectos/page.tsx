'use client';

import { useState, useEffect, useMemo, useRef, startTransition } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import { formatRelativeTime } from '@/lib/relativeTime';
import { getProjectHref, getProjectPreviewHref } from '@/lib/project-url';
import { slugify } from '@/lib/slug';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE } from '@/lib/project-types';
import { pluralize } from '@/lib/units';
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
  unitsCount?: number;
  progress: { done: number; total: number };
  /** Lo que falta cargar, en el orden en que conviene hacerlo — ver GET /api/admin/projects. */
  missing?: string[];
}

type Filter = 'all' | 'published' | 'draft';
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'published', label: 'Publicados' },
  { value: 'draft', label: 'Borradores' },
];

// Rayas del diseño para portadas vacías / de muestra.
const STRIPES = 'repeating-linear-gradient(135deg, #EFECE6 0 12px, #F5F3EE 12px 24px)';

export default function MisProyectosPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const newPanelRef = useRef<HTMLInputElement>(null);
  const focusNewProject = () => {
    newPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    newPanelRef.current?.focus({ preventScroll: true });
  };
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
  const visible = useMemo(() => (projects ?? []).filter(p => {
    if (q && !`${p.name} ${p.location ?? ''}`.toLowerCase().includes(q)) return false;
    if (filter === 'draft') return !p.published;
    if (filter === 'published') return p.published;
    return true;
  }), [projects, q, filter]);

  if (loading) return <LoadingSpinner text="Cargando..." tone="light" />;

  const total = projects?.length ?? 0;
  const publishedCount = (projects ?? []).filter(p => p.published).length;

  return (
    <div className="carga-guiada min-h-[calc(100vh-64px)] bg-[#F5F3EE] flex flex-wrap items-stretch">
      <main className="flex-[999_1_640px] min-w-0 px-4 py-8 sm:px-10 sm:py-10 flex flex-col gap-6">
        <div className="flex items-end justify-between gap-x-6 gap-y-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="m-0 text-[36px] sm:text-[44px] leading-none font-semibold text-gray-900">Mis proyectos</h1>
            <p className="m-0 mt-2 text-sm text-gray-600">
              {total > 0 ? `${total} proyecto${total === 1 ? '' : 's'} · ${publishedCount} publicado${publishedCount === 1 ? '' : 's'}` : 'Todavía no tenés proyectos. Creá el primero con el panel.'}
            </p>
          </div>
          <div className="flex items-center gap-2.5 flex-wrap w-full sm:w-auto">
            <label className="flex-1 sm:flex-none sm:w-[264px] flex items-center gap-2.5 min-h-[44px] px-3.5 rounded-[10px] border border-gray-200 bg-white focus-within:border-brand-700">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6B6A65" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar en mis proyectos" aria-label="Buscar en mis proyectos"
                className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-500" />
            </label>
            <div role="radiogroup" aria-label="Filtrar" className="inline-flex p-[3px] rounded-[10px] bg-[#EAE7E0]">
              {FILTERS.map(f => (
                <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} onClick={() => setFilter(f.value)}
                  className={`min-h-[38px] px-3 rounded-lg text-[13px] ${filter === f.value ? 'bg-white font-semibold text-gray-900 shadow-[0_1px_2px_rgba(23,25,26,0.06)]' : 'text-gray-600 hover:text-gray-900'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={focusNewProject}
              className="lg:hidden ml-auto sm:ml-0 min-h-[44px] px-4 rounded-[10px] bg-gray-900 text-white text-sm font-semibold">
              + Nuevo
            </button>
          </div>
        </div>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))' }}>
          {visible.map(p => {
            const isActive = p.id === activeProjectId;
            const isBusy = selectingId !== null || deleteTarget !== null || duplicatingId !== null;
            const pct = p.progress.total > 0 ? Math.round((p.progress.done / p.progress.total) * 100) : 0;
            const structure = PROJECT_STRUCTURES[p.project_type];
            const units = p.unitsCount ?? 0;
            const meta = [
              structure?.label ?? p.project_type,
              structure?.hasUnitStep && units > 0 ? `${units} ${units === 1 ? structure.unitLabel.toLowerCase() : pluralize(structure.unitLabel.toLowerCase())}` : null,
              p.location,
            ].filter(Boolean).join(' · ');
            const missing = p.missing ?? [];
            return (
              <div
                key={p.id}
                role="button" tabIndex={0}
                onClick={() => { if (!isBusy) enterProject(p.id); }}
                onKeyDown={e => { if (!isBusy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enterProject(p.id); } }}
                aria-disabled={isBusy}
                aria-label={`${p.name} — ${p.published ? 'publicado' : 'borrador'}, ${pct}% cargado`}
                className={`group relative flex flex-col rounded-2xl bg-white overflow-visible cursor-pointer transition-shadow hover:shadow-[0_12px_32px_-14px_rgba(23,25,26,0.25)] border ${
                  isActive ? 'border-brand-700' : 'border-gray-200'
                } ${isBusy ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <div className="relative aspect-[16/9] rounded-t-[15px] overflow-hidden flex items-center justify-center" style={p.masterplan_image ? undefined : { background: STRIPES }}>
                  {p.masterplan_image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.masterplan_image} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <span className="text-[13px] text-gray-700 bg-white px-2.5 py-1.5 rounded-lg">Sin portada — subila para publicar</span>
                  )}
                  <div className="absolute left-3 top-3 flex gap-1.5">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${p.published ? 'bg-gray-900 text-white' : 'bg-white text-amber-800'}`}>
                      {p.published ? 'Publicado' : 'Borrador'}
                    </span>
                    {p.pendingLeadsCount > 0 && (
                      <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-brand-700 text-white">
                        {p.pendingLeadsCount} lead{p.pendingLeadsCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <button
                    type="button" aria-label={`Opciones de ${p.name}`} aria-expanded={menuOpenId === p.id}
                    onClick={e => { e.stopPropagation(); setMenuOpenId(m => (m === p.id ? null : p.id)); }}
                    disabled={isBusy}
                    className={`absolute top-2.5 right-2.5 w-9 h-9 rounded-lg bg-white/95 text-gray-700 flex items-center justify-center hover:text-gray-900 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${menuOpenId === p.id ? 'lg:opacity-100' : ''}`}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
                  </button>
                </div>
                {menuOpenId === p.id && (
                  <div
                    onClick={e => e.stopPropagation()}
                    className="absolute top-12 right-2.5 w-[188px] bg-white border border-gray-200 rounded-xl shadow-[0_16px_34px_-14px_rgba(23,25,26,.3)] p-1.5 z-10"
                  >
                    <button type="button" onClick={() => { setMenuOpenId(null); enterProject(p.id); }} className="w-full text-left min-h-[36px] px-2.5 rounded-lg text-[13px] text-gray-900 hover:bg-gray-100">Seguir cargando</button>
                    <a href={p.published ? getProjectHref(p.slug) : getProjectPreviewHref(p.slug)} target="_blank" rel="noreferrer" onClick={() => setMenuOpenId(null)} className="flex items-center w-full min-h-[36px] px-2.5 rounded-lg text-[13px] text-gray-900 hover:bg-gray-100">{p.published ? 'Ver sitio público' : 'Vista previa (borrador)'}</a>
                    <button type="button" onClick={() => handleDuplicate(p)} className="w-full text-left min-h-[36px] px-2.5 rounded-lg text-[13px] text-gray-900 hover:bg-gray-100">Duplicar</button>
                    <div className="h-px bg-gray-200 my-1 mx-1.5" />
                    <button type="button" onClick={() => { setMenuOpenId(null); setDeleteTarget(p); }} className="w-full text-left min-h-[36px] px-2.5 rounded-lg text-[13px] text-red-700 hover:bg-red-50">Eliminar proyecto</button>
                  </div>
                )}

                <div className="p-[18px] flex flex-col gap-3 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="m-0 font-display text-[19px] font-semibold tracking-[-0.02em] text-gray-900 truncate">{p.name}</p>
                      <p className="m-0 mt-0.5 text-xs text-gray-600 truncate">{meta || 'Sin ubicación cargada'}</p>
                    </div>
                    {p.progress.total > 0 && <ProgressRing pct={pct} />}
                  </div>
                  <div className="mt-auto pt-3 border-t border-gray-200 flex items-center justify-between gap-3">
                    <span className="text-xs text-gray-600 truncate">
                      {missing.length > 0 ? `Falta: ${missing.slice(0, 2).join(' y ')}` : `Editado ${formatRelativeTime(p.updated_at)}`}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold text-gray-900">{missing.length > 0 ? 'Seguir cargando' : 'Abrir'} →</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {visible.length === 0 && total > 0 && (
          <div className="p-10 bg-white border border-gray-200 rounded-2xl flex flex-col items-center gap-2">
            <p className="m-0 text-sm font-semibold text-gray-900">Ningún proyecto coincide con esa búsqueda</p>
            <button type="button" onClick={() => { setQuery(''); setFilter('all'); }} className="min-h-[40px] text-sm font-semibold text-brand-700 underline underline-offset-2">
              Ver todos mis proyectos
            </button>
          </div>
        )}
      </main>

      <NewProjectPanel
        inputRef={newPanelRef}
        onCreated={async (id) => {
          const ok = await setActiveProject(id);
          if (!ok) { toast('No se pudo activar el proyecto nuevo.', 'error'); return; }
          window.location.href = '/admin/carga'; // fuerza reload para que las rutas API lean la cookie nueva
        }}
      />

      <DeleteProjectModal
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); load(); }}
      />
    </div>
  );
}

/** Anillo de progreso de la tarjeta (diseño: 34px, trazo #37463F sobre #EAE7E0, % en el centro). */
function ProgressRing({ pct }: { pct: number }) {
  const C = 2 * Math.PI * 15;
  return (
    <span className="relative w-[38px] h-[38px] shrink-0" aria-hidden="true">
      <svg width="38" height="38" viewBox="0 0 38 38" className="-rotate-90">
        <circle cx="19" cy="19" r="15" fill="none" stroke="#EAE7E0" strokeWidth="3" />
        <circle cx="19" cy="19" r="15" fill="none" stroke="#37463F" strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-gray-900">{pct}</span>
    </span>
  );
}

// Íconos de cada forma (trazo, sin emoji) — mismos dibujos que el diseño de la carga.
const FORM_ICONS: Record<ProjectType, string> = {
  edificio: 'M5 21V3h14v18M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M3 21h18',
  duplex: 'M3 21V10l5-4 5 4v11M13 21V10l4-4 4 4v11M2 21h20',
  casa: 'M4 21V10l8-6 8 6v11M10 21v-6h4v6',
  loteo: 'M3 3h18v18H3zM3 9h18M3 15h18M9 3v18M15 3v18',
  unico: 'M12 3 3 8l9 5 9-5zM3 8v8l9 5 9-5V8',
};

/** Orden del diseño: de lo más común a lo más particular. */
const FORM_ORDER: ProjectType[] = ['edificio', 'duplex', 'casa', 'loteo', 'unico'];

const FORM_HINTS: Record<ProjectType, string> = {
  edificio: 'Pisos y unidades',
  duplex: 'Varias casas',
  casa: 'Una unidad',
  loteo: 'Lotes en plano',
  unico: 'Obra o concurso',
};

// "Vas a cargar:" — qué pasos trae la carga guiada de cada combinación.
function willLoad(type: ProjectType, saleMode: ProjectSaleMode): string {
  const byType: Record<ProjectType, string[]> = {
    edificio: ['Torres, pisos y unidades', 'Tipologías', 'Planta tipo'],
    duplex: ['Dúplex y sus unidades', 'Modelo de unidad', 'Plano del conjunto'],
    casa: ['Datos de la casa', 'Ambientes y recorrido 360°'],
    loteo: saleMode === 'venta' ? ['Plano del loteo', 'Manzanas y lotes', 'Precios por m²'] : ['Plano del loteo', 'Manzanas y lotes'],
    unico: ['Niveles y plantas', 'Espacios'],
  };
  const tail = saleMode === 'venta' ? ['Precios, estados y leads'] : ['Ficha para tu portfolio'];
  return [...byType[type], ...tail].join(' · ');
}

function NewProjectPanel({ onCreated, inputRef }: { onCreated: (id: string) => void; inputRef: React.RefObject<HTMLInputElement | null> }) {
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
    <aside aria-label="Nuevo proyecto" className="flex-[1_1_340px] lg:max-w-[380px] min-w-0 bg-white border-t lg:border-t-0 lg:border-l border-gray-200 px-4 py-8 sm:p-7 flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 font-display text-[26px] leading-tight font-semibold text-gray-900">Nuevo proyecto</h2>
        <p className="m-0 text-[13px] leading-snug text-gray-600">Dos decisiones y el nombre. Todo lo demás se edita después.</p>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-gray-900">1 · ¿Qué forma tiene el desarrollo?</span>
        <div className="grid grid-cols-2 gap-2">
          {FORM_ORDER.map(key => [key, PROJECT_STRUCTURES[key]] as const).map(([key, config]) => {
            const on = form.projectType === key;
            return (
              <button
                type="button" key={key} aria-pressed={on}
                onClick={() => setForm(f => ({
                  ...f, projectType: key,
                  saleMode: config.allowedSaleModes.includes(f.saleMode) ? f.saleMode : config.allowedSaleModes[0],
                }))}
                title={config.description}
                className={`text-left flex flex-col gap-1 min-h-[92px] p-3 rounded-xl transition-colors ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={on ? 'text-brand-700' : 'text-gray-500'}>
                  <path d={FORM_ICONS[key]} />
                </svg>
                <span className="text-[13px] font-semibold text-gray-900 mt-1">{config.label}</span>
                <span className="text-[11px] text-gray-500">{FORM_HINTS[key]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        <span className="text-xs font-semibold text-gray-900">2 · ¿Es para vender o solo para mostrar?</span>
        <div className="grid grid-cols-2 gap-2">
          {(Object.entries(PROJECT_SALE_MODES) as [ProjectSaleMode, typeof PROJECT_SALE_MODES[ProjectSaleMode]][]).map(([key, config]) => {
            const allowed = structure.allowedSaleModes.includes(key);
            const on = form.saleMode === key;
            return (
              <button
                type="button" key={key} aria-pressed={on} disabled={!allowed}
                onClick={() => setForm(f => ({ ...f, saleMode: key }))}
                title={allowed ? config.description : `Un ${structure.label.toLowerCase()} no se vende por unidades.`}
                className={`text-left flex flex-col gap-1 min-h-[64px] p-3 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${on ? 'border-[1.5px] border-brand-700 bg-brand-50' : 'border border-gray-200 bg-white hover:border-gray-300'}`}
              >
                <span className="text-[13px] font-semibold text-gray-900">{config.label}</span>
                <span className="text-[11px] text-gray-500">{key === 'venta' ? 'Precios, estados y leads' : 'Portfolio, sin precios'}</span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-gray-900">3 · Nombre del proyecto</span>
        <input
          ref={inputRef}
          value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="Ej: Loteo Zona Sur"
          className="w-full min-h-[48px] px-3.5 rounded-[10px] border border-gray-300 text-[15px] outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-700 placeholder:text-gray-500"
        />
        <span className="text-[11px] text-gray-500">
          Tu link: <span className="font-medium text-brand-700 font-mono">arq360.com/{slugify(form.name) || 'mi-proyecto'}</span>
        </span>
      </label>

      <div className="rounded-xl bg-gray-100 p-3.5 text-xs text-gray-600 leading-relaxed flex flex-col gap-1.5">
        <span className="font-semibold text-gray-900">Vas a cargar:</span>
        {willLoad(form.projectType, form.saleMode)}
      </div>

      {error && <p role="alert" className="text-xs text-red-600 -mt-2">{error}</p>}

      <button
        type="button" onClick={handleCreate} disabled={!ready || creating}
        className="min-h-[52px] rounded-xl text-[15px] font-semibold text-white bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
      >
        {creating ? 'Creando...' : ready ? 'Crear y empezar' : 'Poné un nombre para empezar'}
      </button>
    </aside>
  );
}
