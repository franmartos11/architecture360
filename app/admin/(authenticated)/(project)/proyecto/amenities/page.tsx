'use client';

import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import AmenitiesEditor from '@/components/admin/section-editors/AmenitiesEditor';

export default function AdminAmenitiesPage() {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Amenities</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pileta, gimnasio, SUM, etc. Pueden ser de todo el complejo o exclusivas de una torre — cada una con su galería de renders y, opcionalmente, un punto de entrada al recorrido 360° correspondiente.
        </p>
      </div>
      <AmenitiesEditor />
    </div>
  );
}
