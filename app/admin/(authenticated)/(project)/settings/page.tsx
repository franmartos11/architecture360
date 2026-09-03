'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import CalculatorEditor from '@/components/admin/section-editors/CalculatorEditor';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { PROJECT_STRUCTURES, PROJECT_SALE_MODES, canonicalProjectType } from '@/lib/project-types';
import type { ProjectSaleMode, ProjectType } from '@/types';

export default function SettingsPage() {
  const { showCalculator } = useProjectTypeConfig();
  const toast = useToast();
  const [project, setProject] = useState<{ id: string; name: string; project_type: string; sale_mode: string; published: boolean } | null>(null);
  const [savingMode, setSavingMode] = useState(false);
  const [savingPublished, setSavingPublished] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => setProject(data.project
        ? { id: data.project.id, name: data.project.name, project_type: data.project.project_type, sale_mode: data.project.sale_mode, published: data.project.published }
        : null))
      .catch(() => {});
  }, []);

  // La FORMA del proyecto (edificio/casa/loteo…) se elige al crearlo y no
  // se cambia — define toda la jerarquía y ya hay estructura colgando. Lo
  // único ajustable acá es el PROPÓSITO: para vender ↔ solo para mostrar.
  const structure = project ? PROJECT_STRUCTURES[canonicalProjectType(project.project_type) as ProjectType] : undefined;
  const allowedModes = structure?.allowedSaleModes ?? (['venta', 'showcase'] as ProjectSaleMode[]);

  const handleSaveMode = async (saleMode: ProjectSaleMode) => {
    if (!project || saleMode === project.sale_mode) return;
    setSavingMode(true);
    const res = await fetch('/api/admin/project', {
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

  const handleTogglePublished = async () => {
    if (!project) return;
    const published = !project.published;
    setSavingPublished(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published }),
    });
    setSavingPublished(false);
    if (res.ok) setProject({ ...project, published });
    else {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo cambiar la visibilidad del proyecto.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Configuración</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta los parámetros de este proyecto y sus herramientas de venta.</p>
      </div>

      {project && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">Visibilidad del sitio</h3>
            <p className="text-sm text-gray-500">
              En borrador, el sitio público de este proyecto deja de responder (404) — vos seguís viéndolo desde el preview de &quot;Sitio web&quot; en el admin mientras lo terminás de cargar.
            </p>
          </CardHeader>
          <div className="p-6">
            <button
              type="button"
              onClick={handleTogglePublished}
              disabled={savingPublished}
              className="flex items-center gap-3 text-left disabled:opacity-60"
            >
              <span className={`w-10 h-6 shrink-0 rounded-full p-0.5 flex transition-colors ${project.published ? 'bg-brand-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <span className="w-5 h-5 rounded-full bg-white shadow" />
              </span>
              <span>
                <span className="block text-sm font-medium text-gray-900">{project.published ? 'Publicado' : 'Borrador'}</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {project.published ? 'El sitio público está en línea.' : 'El sitio público no es accesible todavía.'}
                </span>
              </span>
            </button>
          </div>
        </Card>
      )}

      {project && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">¿Para vender o solo para mostrar?</h3>
            <p className="text-sm text-gray-500">
              Cambia si el sitio público muestra precio, estado de venta, leads y calculadora. La forma del proyecto ({structure?.label ?? project.project_type}) se define al crearlo y no se cambia desde acá.
            </p>
          </CardHeader>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(Object.entries(PROJECT_SALE_MODES) as [ProjectSaleMode, typeof PROJECT_SALE_MODES[ProjectSaleMode]][])
                .filter(([key]) => allowedModes.includes(key))
                .map(([key, config]) => {
                  const isCurrent = key === project.sale_mode;
                  return (
                    <button
                      type="button"
                      key={key}
                      onClick={() => handleSaveMode(key)}
                      disabled={savingMode || isCurrent}
                      className={`text-left p-4 rounded-xl border-2 transition-colors disabled:cursor-default ${
                        isCurrent ? 'border-brand-500 bg-brand-50/50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className="font-medium text-gray-900 text-sm flex items-center gap-2">
                        {config.label}
                        {isCurrent && <span className="text-[11px] font-semibold text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded-full">Actual</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">{config.description}</p>
                    </button>
                  );
                })}
            </div>
            {allowedModes.length === 1 && (
              <p className="text-xs text-gray-400">
                Este tipo de proyecto solo puede ser &ldquo;{PROJECT_SALE_MODES[allowedModes[0]].label}&rdquo;.
              </p>
            )}
            {savingMode && <p className="text-sm text-gray-500">Guardando…</p>}
          </div>
        </Card>
      )}

      {showCalculator && (
        <Card>
          <CardHeader className="block">
            <h3 className="text-lg font-semibold text-gray-900">Calculadora Financiera</h3>
            <p className="text-sm text-gray-500">Estos valores se utilizarán para proyectar las cuotas de hipoteca a los clientes.</p>
          </CardHeader>
          <CalculatorEditor />
        </Card>
      )}

      <Card className="border-red-200 bg-red-50 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between p-6 gap-4">
          <div>
            <h3 className="text-lg font-semibold text-red-800">Zona de peligro</h3>
            <p className="text-sm text-red-600 mt-1 max-w-2xl">
              Eliminar este proyecto borrará permanentemente todo lo cargado: edificios, unidades, fotos, planos, tours y leads. Esta acción no se puede deshacer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            disabled={!project}
            className="shrink-0 px-5 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Eliminar proyecto
          </button>
        </div>
      </Card>

      <DeleteProjectModal
        project={deleteOpen ? project : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => { window.location.href = '/admin/proyectos'; }}
      />
    </div>
  );
}
