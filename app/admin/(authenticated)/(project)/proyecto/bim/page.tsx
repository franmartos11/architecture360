import BimEditor from '@/components/admin/section-editors/BimEditor';

export const metadata = { title: 'Modelo BIM' };

export default function AdminProjectBimPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Modelo BIM</h2>
        <p className="text-sm text-gray-500 mt-1">
          Mostrá tu trabajo con imágenes y, más adelante, un modelo 3D navegable de este proyecto.
        </p>
      </div>
      <BimEditor />
    </div>
  );
}
