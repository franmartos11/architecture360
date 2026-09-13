'use client';

import { useEffect, use } from 'react';
import { useRouter } from 'next/navigation';

// El índice de la unidad ya no muestra nada propio — antes de este shell
// era la pantalla de Ambientes (ver ambientes/page.tsx, donde se mudó).
// Cualquier link viejo a esta ruta cae acá y sigue a /datos.
export default function AdminUnitIndexPage({ params }: { params: Promise<{ id: string; floorId: string; unitId: string }> }) {
  const { id: buildingId, floorId, unitId } = use(params);
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/edificios/${buildingId}/pisos/${floorId}/unidades/${unitId}/datos`);
  }, [router, buildingId, floorId, unitId]);

  return null;
}
