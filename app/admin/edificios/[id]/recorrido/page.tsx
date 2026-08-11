'use client';

import { useState, useEffect, useCallback, use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import type { TourData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminBuildingTourPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [buildingName, setBuildingName] = useState('');
  const [tourData, setTourData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/buildings/${id}`)
      .then(res => res.json())
      .then(data => {
        setBuildingName(data.building?.name ?? '');
        setTourData(data.building?.amenities_tour ?? null);
        setLoading(false);
      })
      .catch(() => {
        setLoadError(true);
        setLoading(false);
      });
  }, [id]);

  useEffect(load, [load]);

  const handlePersist = useCallback(async (next: TourData) => {
    const res = await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amenitiesTour: next }),
    });
    return res.ok;
  }, [id]);

  if (loading) return <LoadingSpinner text="Cargando recorrido..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el recorrido." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${id}`} className="text-sm text-gray-500 hover:text-gray-700">← {buildingName}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Recorrido 360° — {buildingName}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Amenities exclusivas de esta torre (ej: cancha de tenis, rooftop propio) — separado del recorrido general de áreas comunes del complejo.
        </p>
      </div>

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />
    </div>
  );
}
