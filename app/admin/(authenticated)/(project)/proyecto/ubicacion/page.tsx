'use client';

import LocationEditor from '@/components/admin/section-editors/LocationEditor';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';

export default function AdminUbicacionPage() {
  return (
    <div className="flex flex-col gap-7">
      <ChapterHeader
        title="Entorno"
        description="Dónde está y qué tiene cerca. Colegios, salud, comercios, transporte y entretenimiento, con el tiempo desde el proyecto. El centro del mapa se fija en la Ficha → Esencial."
      />
      <LocationEditor />
      <ChapterFooter />
    </div>
  );
}
