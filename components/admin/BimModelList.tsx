'use client';

import type { BimModel } from '@/types';

const STATUS_LABEL: Record<BimModel['status'], { text: string; className: string }> = {
  ready: { text: 'Publicada', className: 'bg-green-50 text-green-700' },
  processing: { text: 'Sin publicar', className: 'bg-amber-50 text-amber-700' },
  failed: { text: 'Con error', className: 'bg-red-50 text-red-700' },
};

export default function BimModelList({
  models,
  selectedId,
  onSelect,
}: {
  models: BimModel[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (models.length === 0) {
    return (
      <p className="text-sm text-gray-500 px-1 py-6">
        Todavía no cargaste ninguna pieza. Creá la primera con el botón de arriba.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {models.map(m => {
        const status = STATUS_LABEL[m.status];
        return (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              className={`w-full text-left rounded-xl border px-3.5 py-3 transition-colors ${
                selectedId === m.id
                  ? 'border-brand-500 bg-brand-50/50'
                  : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-3">
                {m.coverImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.coverImage} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{m.title}</p>
                  <p className="text-xs text-gray-500">
                    {m.galleryImages.length} {m.galleryImages.length === 1 ? 'imagen' : 'imágenes'}
                    {m.geometryUrl ? ' · con modelo 3D' : ''}
                  </p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-md shrink-0 ${status.className}`}>
                  {status.text}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
