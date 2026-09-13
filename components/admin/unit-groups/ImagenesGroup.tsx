'use client';

import ImageUploader from '@/components/admin/ImageUploader';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import type { UnitGroupProps } from '@/lib/unit-fields';

export default function ImagenesGroup({ values, onChange }: UnitGroupProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Foto principal</p>
        <ImageUploader value={values.interiorImageUrl ?? ''} onChange={url => onChange({ interiorImageUrl: url || null })} folder="units" />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-[11.5px] font-medium text-gray-900">Galería de imágenes</p>
        <MultiImageUploader values={values.galleryImages ?? []} onChange={urls => onChange({ galleryImages: urls })} folder="units" />
      </div>
    </div>
  );
}
