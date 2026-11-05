'use client';

import AmenitiesEditor from '@/components/admin/section-editors/AmenitiesEditor';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';

export default function AdminAmenitiesPage() {
  return (
    <div className="flex flex-col gap-7">
      <ChapterHeader
        title="Entorno"
        description="Lo que tiene el proyecto: pileta, gimnasio, SUM… De todo el complejo o exclusivas de una torre, cada una con sus fotos y, si querés, su entrada al recorrido 360°."
      />
      <AmenitiesEditor />
      <ChapterFooter />
    </div>
  );
}
