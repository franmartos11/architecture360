import BimEditor from '@/components/admin/section-editors/BimEditor';
import { ChapterHeader, ChapterFooter } from '@/components/admin/section-editors/FichaChrome';

export const metadata = { title: 'Modelo BIM' };

export default function AdminProjectBimPage() {
  return (
    <div className="flex flex-col gap-7">
      <ChapterHeader
        title="Inmersivo"
        description="Recorrido 360°, modelo BIM y vista 3D en un mismo lugar. Mostrá tu trabajo con imágenes y un modelo 3D navegable de este proyecto."
      />
      <BimEditor />
      <ChapterFooter />
    </div>
  );
}
