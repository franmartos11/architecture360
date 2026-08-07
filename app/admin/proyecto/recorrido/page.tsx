'use client';

import { useState, useEffect, useCallback } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import type { TourData } from '@/types';

export default function AdminCommonAreasTourPage() {
  const [tourData, setTourData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setTourData(data.project?.common_areas_tour ?? null);
        setLoading(false);
      });
  }, []);

  const handlePersist = useCallback(async (next: TourData) => {
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commonAreasTour: next }),
    });
    return res.ok;
  }, []);

  if (loading) return <div className="text-gray-500">Cargando recorrido...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Recorrido de espacios comunes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pasillos, pileta, parrilla, gimnasio y demás áreas comunes del edificio — el recorrido que se ve en "Recorrer el edificio" desde la vista aérea.
        </p>
      </div>

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />
    </div>
  );
}
