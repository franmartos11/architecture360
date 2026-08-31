'use client';

import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import LocationEditor from '@/components/admin/section-editors/LocationEditor';

export default function AdminUbicacionPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Ubicación y Puntos de Interés</h2>
        <p className="text-sm text-gray-500 mt-1">
          Colegios, salud, comercios, transporte y entretenimiento cercanos al proyecto. Las coordenadas del centro del mapa se configuran en &quot;Proyecto → Datos generales&quot;.
        </p>
      </div>
      <LocationEditor />
    </div>
  );
}
