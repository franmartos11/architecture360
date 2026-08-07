'use client';

import ImageUploader from './ImageUploader';

interface MultiImageUploaderProps {
  values: string[];
  onChange: (urls: string[]) => void;
  folder: string;
  label?: string;
}

export default function MultiImageUploader({ values, onChange, folder, label }: MultiImageUploaderProps) {
  const updateAt = (i: number, url: string) => {
    const next = [...values];
    next[i] = url;
    onChange(next);
  };
  const removeAt = (i: number) => onChange(values.filter((_, idx) => idx !== i));
  const addEmpty = () => onChange([...values, '']);

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div className="space-y-3">
        {values.map((v, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex-1">
              <ImageUploader value={v} onChange={url => updateAt(i, url)} folder={folder} />
            </div>
            <button type="button" onClick={() => removeAt(i)} className="text-gray-400 hover:text-red-500 mt-4 shrink-0">×</button>
          </div>
        ))}
        <button type="button" onClick={addEmpty} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          + Agregar imagen
        </button>
      </div>
    </div>
  );
}
