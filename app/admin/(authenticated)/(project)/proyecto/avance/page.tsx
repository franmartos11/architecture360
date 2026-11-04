'use client';

import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ConstructionProgressEditor from '@/components/admin/section-editors/ConstructionProgressEditor';

export default function AdminConstructionProgressPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Avance de obra</h2>
        <p className="text-sm text-gray-500 mt-1">
          Contá cómo va la obra con fotos y fechas. Las etapas, los textos y qué mostrar los elegís vos — sirve igual para un edificio, una casa o un loteo. En el sitio aparece como una sección más (se ordena u oculta desde Sitio web → Secciones), con un time-lapse de todas las fotos.
        </p>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <ConstructionProgressEditor onSaved={() => {}} />
      </div>
    </div>
  );
}
