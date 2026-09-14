'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import BimModelList from '@/components/admin/BimModelList';
import BimModelEditor from '@/components/admin/BimModelEditor';
import type { BimModel } from '@/types';

export default function BimAdminClient({
  initialModels,
  projects,
}: {
  initialModels: BimModel[];
  projects: { id: string; name: string }[];
}) {
  const [models, setModels] = useState(initialModels);
  const [selectedId, setSelectedId] = useState<string | null>(initialModels[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();

  const selected = models.find(m => m.id === selectedId) ?? null;

  const create = async () => {
    setCreating(true);
    const res = await fetch('/api/admin/bim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Pieza sin título' }),
    });
    setCreating(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? 'No se pudo crear la pieza.', 'error');
      return;
    }
    const model = data.model as BimModel;
    setModels(prev => [model, ...prev]);
    setSelectedId(model.id);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Modelos BIM</h1>
          <p className="text-sm text-gray-500 mt-1">
            Piezas de tu portfolio. Cada una puede tener imágenes y, más adelante, un modelo 3D navegable.
          </p>
        </div>
        <Button type="button" onClick={create} disabled={creating}>
          <Plus className="w-4 h-4" /> {creating ? 'Creando...' : 'Nueva pieza'}
        </Button>
      </div>

      <div className="grid md:grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-6 items-start">
        <BimModelList models={models} selectedId={selectedId} onSelect={setSelectedId} />
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          {selected ? (
            <BimModelEditor
              model={selected}
              projects={projects}
              onSaved={updated => setModels(prev => prev.map(m => (m.id === updated.id ? updated : m)))}
              onDeleted={id => {
                setModels(prev => prev.filter(m => m.id !== id));
                setSelectedId(prev => (prev === id ? null : prev));
              }}
            />
          ) : (
            <p className="text-sm text-gray-500">Elegí una pieza de la lista o creá una nueva.</p>
          )}
        </div>
      </div>
    </div>
  );
}
