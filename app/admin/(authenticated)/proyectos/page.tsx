'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/ToastProvider';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, DEFAULT_PROJECT_TYPE, DEFAULT_SALE_MODE, getProjectTypeConfig } from '@/lib/project-types';
import type { ProjectType, ProjectSaleMode } from '@/types';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  masterplan_image: string | null;
  project_type: ProjectType;
  sale_mode: ProjectSaleMode;
  pendingLeadsCount: number;
  commentsCount: number;
}

export default function MisProyectosPage() {
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    projectType: DEFAULT_PROJECT_TYPE as ProjectType,
    saleMode: DEFAULT_SALE_MODE as ProjectSaleMode,
  });
  const [error, setError] = useState('');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const toast = useToast();

  const load = () => {
    setLoading(true);
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

  const enterProject = async (id: string) => {
    setSelectingId(id);
    const ok = await setActiveProject(id);
    if (ok) {
      window.location.href = '/admin'; // fuerza reload para que las rutas API lean la cookie nueva
    } else {
      setSelectingId(null);
      toast('No se pudo entrar a ese proyecto.', 'error');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name) return;
    setCreating(true);
    const res = await fetch('/api/admin/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const created = await res.json();
      const ok = await setActiveProject(created.id);
      if (!ok) { toast('No se pudo activar el proyecto nuevo.', 'error'); setCreating(false); return; }
      // Proyecto recién creado y sin nada cargado — directo a la carga guiada.
      window.location.href = '/admin/wizard'; // fuerza reload para que las rutas API lean la cookie nueva
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Error al crear el proyecto.');
      setCreating(false);
    }
  };

  if (loading) {
    return <LoadingSpinner text="Cargando..." tone="light" />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto space-y-8 px-4 py-12">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Mis proyectos</h1>
          <p className="text-gray-500 mt-1">
            {projects && projects.length === 1
              ? 'Es el único proyecto de tu cuenta — creá uno nuevo si querés empezar otro.'
              : 'Elegí un proyecto para seguir cargándolo, o creá uno nuevo.'}
          </p>
        </div>

        {projects && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {projects.map(p => {
              const isActive = p.id === activeProjectId;
              const isBusy = selectingId !== null || deleteTarget !== null;
              return (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => { if (!isBusy) enterProject(p.id); }}
                  onKeyDown={e => { if (!isBusy && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); enterProject(p.id); } }}
                  aria-disabled={isBusy}
                  className={`relative text-left bg-white rounded-2xl border hover:shadow-md transition-all overflow-hidden cursor-pointer ${isBusy ? 'opacity-50 pointer-events-none' : ''} ${
                    isActive ? 'border-brand-400 ring-1 ring-brand-400' : 'border-gray-200 hover:border-brand-400'
                  }`}
                >
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}
                    disabled={isBusy}
                    aria-label={`Borrar ${p.name}`}
                    title="Borrar proyecto"
                    className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 text-gray-400 hover:text-red-600 hover:bg-white shadow-sm transition-colors disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="h-32 bg-gray-100 flex items-center justify-center relative">
                    {p.masterplan_image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.masterplan_image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-4xl">🏗️</span>
                    )}
                    {isActive && (
                      <span className="absolute bottom-2 right-2 text-[11px] font-medium text-white bg-brand-500 px-2 py-0.5 rounded-full shadow-sm">
                        Activo
                      </span>
                    )}
                    {p.pendingLeadsCount > 0 && (
                      <span className="absolute top-2 left-2 text-[11px] font-bold text-white bg-red-500 px-2 py-0.5 rounded-full shadow-sm">
                        {p.pendingLeadsCount} lead{p.pendingLeadsCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <div className="p-4">
                    <p className="font-semibold text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{p.slug}</p>
                    <div className="flex items-center flex-wrap gap-1.5 mt-2">
                      <span className="text-[11px] font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                        {getProjectTypeConfig(p.project_type, p.sale_mode).label}
                      </span>
                      {p.commentsCount > 0 && (
                        <span className="text-[11px] font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          💬 {p.commentsCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-gray-900">+ Nuevo proyecto</h3>
          </CardHeader>
          <form onSubmit={handleCreate} className="p-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Qué forma tiene el desarrollo?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(PROJECT_STRUCTURES) as [ProjectType, typeof PROJECT_STRUCTURES[ProjectType]][]).map(([key, config]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setForm({ ...form, projectType: key })}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${
                      form.projectType === key ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{config.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">¿Es para vender o solo para mostrar?</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(Object.entries(PROJECT_SALE_MODES) as [ProjectSaleMode, typeof PROJECT_SALE_MODES[ProjectSaleMode]][]).map(([key, config]) => (
                  <button
                    type="button"
                    key={key}
                    onClick={() => setForm({ ...form, saleMode: key })}
                    className={`text-left p-4 rounded-xl border-2 transition-colors ${
                      form.saleMode === key ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <p className="font-medium text-gray-900 text-sm">{config.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">Por ejemplo: un estudiante de arquitectura mostrando su proyecto de estudio elegiría "Solo para mostrar" — sin precio, sin estado de venta, sin formulario de contacto.</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <Input
                  label="Nombre"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Mi proyecto"
                  required
                />
              </div>
              <Button type="submit" disabled={creating} className="w-full sm:w-auto">
                {creating ? 'Creando...' : '+ Crear proyecto'}
              </Button>
            </div>
            <p className="text-xs text-gray-400">
              El link para compartirlo se genera solo a partir del nombre — lo vas a poder ver en "Proyecto" apenas lo crees.
            </p>
          </form>
          {error && <p className="px-6 pb-4 text-sm text-red-500">{error}</p>}
        </Card>
      </div>

      <DeleteProjectModal
        project={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); load(); }}
      />
    </div>
  );
}
