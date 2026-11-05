'use client';

import ConstructionProgressEditor from '@/components/admin/section-editors/ConstructionProgressEditor';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';

export default function AdminConstructionProgressPage() {
  return (
    <div className="flex flex-col gap-7">
      <ChapterHeader
        title="Obra"
        description="Mostrá que avanza. Una entrada por mes alcanza: fotos, un porcentaje y una línea. En el sitio aparece con un time-lapse de todas las fotos."
      />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
        <ConstructionProgressEditor onSaved={() => {}} />
      </div>
      <ChapterFooter />
    </div>
  );
}
