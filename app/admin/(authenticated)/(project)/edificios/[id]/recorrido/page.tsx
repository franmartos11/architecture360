'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect, useCallback, use, startTransition } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import TourOrientationControl from '@/components/admin/TourOrientationControl';
import { Card, CardHeader } from '@/components/ui/Card';
import type { TourData } from '@/types';
import { PageSkeleton, Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminBuildingTourPage({ params }: { params: Promise<{ id: string }> }) {
  const contentIn = useContentIn();
  const { id } = use(params);

  const [buildingName, setBuildingName] = useState('');
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
    fetch(`/api/admin/buildings/${id}`)
      .then(res => res.json())
      .then(data => {
        setBuildingName(data.building?.name ?? '');
        setTourData(data.building?.amenities_tour ?? null);
        setOrientationDegrees(data.building?.tour_orientation_degrees ?? undefined);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
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

  const handleOrientationChange = useCallback(async (degrees: number | undefined) => {
    setOrientationDegrees(degrees);
    setSavingOrientation(true);
    await fetch(`/api/admin/buildings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourOrientationDegrees: degrees ?? null }),
    });
    setSavingOrientation(false);
  }, [id]);

  if (loading) return (
    <PageSkeleton>
      <Skeleton className="h-[420px] w-full rounded-2xl" />
      <SkeletonCard lines={2} />
    </PageSkeleton>
  );
  if (loadError) return <ErrorState message="No se pudo cargar el recorrido." onRetry={load} />;

  return (
    <m.div {...contentIn} className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${id}`} className="inline-flex items-center min-h-[28px] text-[13px] text-gray-600 hover:text-gray-900">← {buildingName}</Link>
        <p className="m-0 mt-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-gray-500">{buildingName}</p>
        <h1 className="m-0 mt-1.5 text-[34px] sm:text-[44px] leading-[1.05] font-semibold text-gray-900">Recorrido 360°</h1>
        <p className="m-0 mt-2.5 text-sm leading-relaxed text-gray-600 max-w-[680px]">
          Amenities exclusivas de esta torre (ej: cancha de tenis, rooftop propio) — separado del recorrido general de áreas comunes del complejo.
        </p>
      </div>

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />

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
    </m.div>
  );
}
