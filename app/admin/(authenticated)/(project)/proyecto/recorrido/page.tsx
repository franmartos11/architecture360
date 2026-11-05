'use client';

import { useState, useEffect, useCallback, startTransition } from 'react';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import TourEditor from '@/components/admin/TourEditor';
import TourOrientationControl from '@/components/admin/TourOrientationControl';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import type { TourData } from '@/types';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';

export default function AdminCommonAreasTourPage() {
  const activeProjectId = useActiveProjectId();
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
    fetch(withActiveProject('/api/admin/project', activeProjectId))
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
  }, [activeProjectId]);

  useEffect(load, [load]);

  const handlePersist = useCallback(async (next: TourData) => {
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commonAreasTour: next }),
    });
    return res.ok;
  }, [activeProjectId]);

  const handleOrientationChange = useCallback(async (degrees: number | undefined) => {
    setOrientationDegrees(degrees);
    setSavingOrientation(true);
    await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourOrientationDegrees: degrees ?? null }),
    });
    setSavingOrientation(false);
  }, [activeProjectId]);

  if (loading) return <LoadingSpinner text="Cargando recorrido..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el recorrido." onRetry={load} />;

  return (
    <div className="flex flex-col gap-7">
      <ChapterHeader
        title="Inmersivo"
        description="Recorrido 360°, modelo BIM y vista 3D en un mismo lugar. Acá van los espacios comunes: pasillos, pileta, parrilla, gimnasio — lo que se ve en “Recorrer el edificio” desde la vista aérea."
      />

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />

      <section className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="m-0 text-[15px] font-semibold text-gray-900">Orientación del recorrido</h2>
          <p className="m-0 text-[13px] text-gray-600">Para mostrar por dónde sale y se pone el sol dentro del visor 360°.</p>
        </div>
        <TourOrientationControl
          hint='Arrastrá la aguja (o tipeá el grado) hasta que apunte al norte real, tomando como referencia el primer ambiente del recorrido — el que se ve apenas entrás, mirando derecho al frente sin girar la cámara.'
          value={orientationDegrees}
          onChange={handleOrientationChange}
          disabled={savingOrientation}
        />
      </section>

      <ChapterFooter />
    </div>
  );
}
