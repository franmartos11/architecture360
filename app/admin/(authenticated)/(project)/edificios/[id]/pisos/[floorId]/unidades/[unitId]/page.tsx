'use client';

import { use } from 'react';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';

export default function AdminUnitRoomsPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);

  return (
    <div className="space-y-6">
      <Link href={`/admin/edificios/${buildingId}/pisos/${floorId}`} className="text-sm text-gray-500 hover:text-gray-700">← Volver a unidades</Link>
      <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={unitId} />
    </div>
  );
}
