import BimEditor from '@/components/admin/section-editors/BimEditor';
import { ChapterFooter } from '@/components/admin/section-editors/FichaChrome';
import { InmersivoHeader, InmersivoSummary } from '@/components/admin/inmersivo/InmersivoChrome';

export const metadata = { title: 'Modelo BIM' };

export default function AdminProjectBimPage() {
  return (
    <div className="flex flex-col gap-7">
      <InmersivoHeader />
      <BimEditor />
      <InmersivoSummary />
      <ChapterFooter />
    </div>
  );
}
