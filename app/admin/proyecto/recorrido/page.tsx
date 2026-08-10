'use client';

import { useState, useEffect, useCallback } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import type { TourData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminCommonAreasTourPage() {
  const [tourData, setTourData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setTourData(data.project?.common_areas_tour ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, []);

  useEffect(load, [load]);

  const handlePersist = useCallback(async (next: TourData) => {
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commonAreasTour: next }),
    });
    return res.ok;
  }, []);

  if (loading) return <LoadingSpinner text="Cargando recorrido..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el recorrido." onRetry={load} />;

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
