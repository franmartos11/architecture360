'use client';

import { use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import FloorUnitsEditor from '@/components/admin/FloorUnitsEditor';
import UnitsEditor from '@/components/admin/UnitsEditor';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import ErrorState from '@/components/ui/ErrorState';
import { useState, useEffect, startTransition } from 'react';
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
  const [loading, setLoading] = useState(!isSingleHouse);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    // casa: el header no usa el nombre del edificio (el link "volver" va a
    // Proyecto). Nos ahorramos el fetch — FloorUnitsEditor hace su propia
    // carga. Con lista de unidades sí hace falta para el header/breadcrumb
    // de UnitsEditor.
    if (isSingleHouse) return;
    startTransition(() => {
      setLoading(true);
      setLoadError(false);
    });
    fetch(`/api/admin/buildings/${buildingId}`)
      .then(res => res.json())
      .then(data => {
        setBuildingName(data.building?.name ?? '');
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

  // Cualquier tipo con lista de unidades (edificio/dúplex/único/loteo):
  // pantalla de lista + panel, con CSV/bulk/estado de delimitación (ver
  // UnitsEditor.tsx). Casa (sin paso de unidades) es un registro único —
  // sigue con el formulario genérico de FloorUnitsEditor, más abajo.
  if (hasUnitStep) {
    return <UnitsEditor buildingId={buildingId} floorId={floorId} buildingName={buildingName} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/proyecto" className="text-sm text-gray-500 hover:text-gray-700">← Proyecto</Link>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">
            Datos {agree.del} {buildingLabel.toLowerCase()}
          </h2>
        </div>
      </div>

      <FloorUnitsEditor buildingId={buildingId} floorId={floorId} />
    </div>
  );
}
