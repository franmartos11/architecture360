'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';

export default function ProcessEditor({ onSaved }: { onSaved: () => void }) {
  const [images, setImages] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => { setImages(data.project?.process_gallery ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!images) return;
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ processGallery: images }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || !images) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <div className="p-6 space-y-4">
      <MultiImageUploader values={images} onChange={setImages} folder="process" />
      <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}
