'use client';

import TourEditor from '@/components/admin/TourEditor';
import { useUnitShell } from '../unit-shell-context';

export default function AdminUnitTourPage() {
  const { values, patch } = useUnitShell();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-gray-500 leading-relaxed">
        Cada ambiente necesita una panorámica 360° (imagen equirectangular). Los &quot;id&quot; de los ambientes acá pueden coincidir con el &quot;Tour node id&quot; que le pusiste a cada ambiente en la pantalla de Ambientes, para que tocar el plano salte directo a la panorámica correspondiente.
      </p>
      <TourEditor initialTourData={values.tourData} onPersist={next => patch({ tourData: next })} />
    </div>
  );
}
