'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import TourEditor from '@/components/admin/TourEditor';
import type { TourData } from '@/types';

export default function AdminUnitTourPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);

  const [unitCode, setUnitCode] = useState('');
  const [tourData, setTourData] = useState<TourData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/units/${unitId}`)
      .then(res => res.json())
      .then(unit => {
        setUnitCode(unit.code ?? '');
        setTourData(unit.tour_data ?? null);
        setLoading(false);
      });
  }, [unitId]);

  const handlePersist = useCallback(async (next: TourData) => {
    const res = await fetch(`/api/admin/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tourData: next }),
    });
    return res.ok;
  }, [unitId]);

  if (loading) return <div className="text-gray-500">Cargando recorrido...</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}`} className="text-sm text-gray-500 hover:text-gray-700">← {unitCode}</Link>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight mt-1">Recorrido 360° — {unitCode}</h2>
        <p className="text-sm text-gray-500 mt-1">
          Cada ambiente necesita una panorámica 360° (imagen equirectangular). Los "id" de los ambientes acá pueden coincidir con el "Tour node id" que le pusiste a cada ambiente en la pantalla de Ambientes, para que tocar el plano salte directo a la panorámica correspondiente.
        </p>
      </div>

      <TourEditor initialTourData={tourData} onPersist={handlePersist} />
    </div>
  );
}
