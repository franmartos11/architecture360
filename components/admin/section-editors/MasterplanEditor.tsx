'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect } from 'react';
import Button from '@/components/ui/Button';
import ImageUploader from '@/components/admin/ImageUploader';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';

export default function MasterplanEditor({ onSaved }: { onSaved: () => void }) {
  const contentIn = useContentIn();
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => { setImage(data.project?.masterplan_image ?? ''); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeProjectId]);

  const handleSave = async () => {
    if (image === null) return;
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ masterplanImage: image }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || image === null) return (
      <div role="status" aria-label="Cargando" className="p-6"><Skeleton className="aspect-[16/9] w-full rounded-2xl" /></div>
    );

  return (
    <m.div {...contentIn} className="p-6 space-y-4">
      <ImageUploader label="Imagen del masterplan" value={image} onChange={setImage} folder="masterplan" />
      <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </m.div>
  );
}
