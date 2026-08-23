'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import type { BeforeAfterPair } from '@/types';

export default function BeforeAfterEditor({ onSaved }: { onSaved: () => void }) {
  const [pairs, setPairs] = useState<BeforeAfterPair[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => { setPairs(data.project?.before_after ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const updateAt = (i: number, updates: Partial<BeforeAfterPair>) => {
    if (!pairs) return;
    const next = [...pairs];
    next[i] = { ...next[i], ...updates };
    setPairs(next);
  };
  const removeAt = (i: number) => {
    if (!pairs) return;
    setPairs(pairs.filter((_, idx) => idx !== i));
  };
  const addPair = () => {
    setPairs([...(pairs ?? []), { label: '', beforeImage: '', afterImage: '' }]);
  };

  const handleSave = async () => {
    if (!pairs) return;
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beforeAfter: pairs }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || !pairs) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <div>
      <div className="divide-y divide-gray-100">
        {pairs.map((pair, i) => (
          <div key={i} className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <Input
                  label="Etiqueta"
                  value={pair.label}
                  onChange={e => updateAt(i, { label: e.target.value })}
                  placeholder="Fachada, Interior, Patio..."
                />
              </div>
              <button type="button" onClick={() => removeAt(i)} className="text-sm text-red-500 hover:text-red-700 mt-6 shrink-0">
                Borrar
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <ImageUploader label="Antes" value={pair.beforeImage} onChange={url => updateAt(i, { beforeImage: url })} folder="before-after" />
              <ImageUploader label="Después" value={pair.afterImage} onChange={url => updateAt(i, { afterImage: url })} folder="before-after" />
            </div>
          </div>
        ))}
        {pairs.length === 0 && (
          <p className="p-6 text-sm text-gray-400 text-center">Todavía no cargaste ninguna comparación.</p>
        )}
      </div>
      <div className="p-6 bg-gray-50/50 flex items-center justify-between gap-3">
        <button type="button" onClick={addPair} className="text-sm font-medium text-brand-600 hover:text-brand-700">
          + Agregar comparación
        </button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}
