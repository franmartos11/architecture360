'use client';

import { use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FloorUnitsEditor from '@/components/admin/FloorUnitsEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useState, useEffect } from 'react';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { buildingAgreement } from '@/lib/project-types';

export default function AdminFloorUnitsPage({ params }: { params: Promise<{ id: string; floorId: string }> }) {
  const { id: buildingId, floorId } = use(params);
  const typeConfig = useProjectTypeConfig();
  const { hasFloorStep, hasUnitStep, buildingLabel } = typeConfig;
  const agree = buildingAgreement(typeConfig);
  // casa: la pantalla de edificio redirige acá, así que "volver" ahí no
  // tiene sentido — se sube a Proyecto.
  const isSingleHouse = !hasFloorStep && !hasUnitStep;

  const [buildingName, setBuildingName] = useState('');
  const [floorLabel, setFloorLabel] = useState('');
  const [loading, setLoading] = useState(!isSingleHouse);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // casa: el header no usa el nombre del edificio ni la etiqueta del piso
    // (el link "volver" va a Proyecto). Nos ahorramos el fetch — FloorUnitsEditor
    // hace su propia carga.
    if (isSingleHouse) return;
    setLoading(true);
    setLoadError(false);
    fetch(`/api/admin/buildings/${buildingId}`)
      .then(res => res.json())
      .then(data => {
        setBuildingName(data.building?.name ?? '');
        const floor = (data.floors ?? []).find((f: { id: string }) => f.id === floorId);
        setFloorLabel(floor?.label ?? '');
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoadError(true);
        setLoading(false);
      });
  }, [buildingId, floorId, isSingleHouse]);

  if (loading) return <LoadingSpinner text="Cargando piso..." tone="light" />;
  if (loadError) return <ErrorState message="No se pudo cargar el piso." />;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href={isSingleHouse ? '/admin/proyecto' : `/admin/edificios/${buildingId}`} className="text-sm text-gray-500 hover:text-gray-700">← {isSingleHouse ? 'Proyecto' : buildingName}</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">
            {hasUnitStep ? `Unidades — ${floorLabel}` : `Datos ${agree.del} ${buildingLabel.toLowerCase()}`}
          </h2>
        </div>
        {hasUnitStep && (
          <Link
            href={`/admin/edificios/${buildingId}/pisos/${floorId}/plano`}
            className="px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors whitespace-nowrap"
          >
            Delimitar en el plano →
          </Link>
        )}
      </div>

      <FloorUnitsEditor buildingId={buildingId} floorId={floorId} />
    </div>
  );
}
