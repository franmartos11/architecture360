'use client';

import { usePathname } from 'next/navigation';
import { TransitionLink as Link } from '@/components/ui/TransitionUtils';
import ConstructionProgressEditor from '@/components/admin/section-editors/ConstructionProgressEditor';
import BeforeAfterEditor from '@/components/admin/section-editors/BeforeAfterEditor';
import { ChapterTabs, ChapterFooter, useChapterEyebrow } from '@/components/admin/section-editors/FichaChrome';
import { PageHeader } from '@/components/admin/panel-ui';

// Capítulo Obra (diseño): resumen de avance + bitácora mensual y, abajo,
// los pares Antes / Después. El botón "+ Nueva entrada" del encabezado lo
// provee el editor (es el que maneja la lista).
export default function AdminConstructionProgressPage() {
  const pathname = usePathname();
  const eyebrow = useChapterEyebrow();
  return (
    <div className="flex flex-col gap-8">
      <ConstructionProgressEditor
        onSaved={() => {}}
        header={newEntry => (
          <PageHeader
            back={<Link href="/admin/proyecto" className="inline-flex items-center min-h-[36px] hover:text-gray-900">← Ficha del proyecto</Link>}
            eyebrow={eyebrow}
            title="Obra"
            description="Mostrá que avanza. Una entrada por mes alcanza: fotos, un porcentaje y una línea."
            actions={<>{newEntry}<ChapterTabs current={pathname} /></>}
          />
        )}
      />
      <div className="pt-8 border-t border-gray-200">
        <BeforeAfterEditor onSaved={() => {}} />
      </div>
      <ChapterFooter />
    </div>
  );
}
