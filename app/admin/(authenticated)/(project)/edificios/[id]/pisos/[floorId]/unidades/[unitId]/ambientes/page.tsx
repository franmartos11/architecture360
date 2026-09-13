'use client';

import { use } from 'react';
import UnitRoomsEditor from '@/components/admin/UnitRoomsEditor';

export default function UnitAmbientesPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  return <UnitRoomsEditor buildingId={buildingId} floorId={floorId} unitId={unitId} />;
}
