'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import TourOrientationControl from '@/components/admin/TourOrientationControl';
import { Card, CardHeader } from '@/components/ui/Card';
import type { TourData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminCommonAreasTourPage() {
  const [tourData, setTourData] = useState<TourData | null>(null);
  const [orientationDegrees, setOrientationDegrees] = useState<number | undefined>(undefined);
  const [savingOrientation, setSavingOrientation] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        setTourData(data.project?.common_areas_tour ?? null);
        setOrientationDegrees(data.project?.tour_orientation_degrees ?? undefined);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
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

  const handleOrientationChange = useCallback(async (degrees: number | undefined) => {
    setOrientationDegrees(degrees);
    setSavingOrientation(true);
    await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourOrientationDegrees: degrees ?? null }),
    });
    setSavingOrientation(false);
  }, []);

  if (loading) return <LoadingSpinner text="Cargando recorrido..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el recorrido." onRetry={load} />;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Recorrido de espacios comunes</h2>
        <p className="text-sm text-gray-500 mt-1">
          Pasillos, pileta, parrilla, gimnasio y demás áreas comunes del edificio — el recorrido que se ve en &quot;Recorrer el edificio&quot; desde la vista aérea.
        </p>
      </div>

      <Card>
        <CardHeader className="block">
          <h3 className="text-lg font-semibold text-gray-900">Orientación del recorrido</h3>
          <p className="text-sm text-gray-500">Para mostrar por dónde sale y se pone el sol dentro del visor 360°.</p>
        </CardHeader>
        <div className="p-6">
          <TourOrientationControl
            hint='Arrastrá la aguja (o tipeá el grado) hasta que apunte al norte real, tomando como referencia el primer ambiente del recorrido — el que se ve apenas entrás, mirando derecho al frente sin girar la cámara.'
            value={orientationDegrees}
            onChange={handleOrientationChange}
            disabled={savingOrientation}
          />
        </div>
      </Card>

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />
    </div>
  );
}
