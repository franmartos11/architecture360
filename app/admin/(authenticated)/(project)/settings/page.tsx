'use client';

import { useState, useEffect } from 'react';
import { Card, CardHeader } from '@/components/ui/Card';
import CalculatorEditor from '@/components/admin/section-editors/CalculatorEditor';
import DeleteProjectModal from '@/components/admin/DeleteProjectModal';

export default function SettingsPage() {
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => setProject(data.project ? { id: data.project.id, name: data.project.name } : null))
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Configuración</h2>
        <p className="text-sm text-gray-500 mt-1">Ajusta los parámetros de este proyecto y sus herramientas de venta.</p>
      </div>

      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Calculadora Financiera</h3>
          <p className="text-sm text-gray-500">Estos valores se utilizarán para proyectar las cuotas de hipoteca a los clientes.</p>
        </CardHeader>
        <CalculatorEditor />
      </Card>

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
