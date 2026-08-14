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
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div className="space-y-3">
        {values.map((v, i) => (
          <div key={i} className="flex items-start gap-2">
            <div className="flex flex-col mt-4 shrink-0">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Subir"
                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === values.length - 1}
                aria-label="Bajar"
                className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-700 disabled:opacity-25 disabled:hover:text-gray-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
            </div>
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
