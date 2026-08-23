'use client';

import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';

export default function MasterplanEditor({ onSaved }: { onSaved: () => void }) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => { setImage(data.project?.masterplan_image ?? ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (image === null) return;
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterplanImage: image }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || image === null) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <div className="p-6 space-y-4">
      <ImageUploader label="Imagen del masterplan" value={image} onChange={setImage} folder="masterplan" />
      <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </div>
  );
}
