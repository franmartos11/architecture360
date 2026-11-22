'use client';

import { m } from 'framer-motion';
import { useContentIn } from '@/components/ui/Loaded';
import { useState, useEffect } from 'react';
import ImageUploader from '@/components/admin/ImageUploader';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/ToastProvider';
import { fieldClass } from '@/components/admin/panel-ui';
import type { BeforeAfterPair } from '@/types';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';

// Antes / Después (diseño del capítulo Obra): cada par es una tarjeta con
// la comparación deslizable de render vs. foto real; "Editar" abre la
// etiqueta y las dos imágenes. Se guarda la lista entera de una vez
// (PATCH beforeAfter), igual que antes. Vive en Obra y en el panel de
// Secciones (/admin/sitio).
export default function BeforeAfterEditor({ onSaved }: { onSaved: () => void }) {
  const contentIn = useContentIn();
  const [pairs, setPairs] = useState<BeforeAfterPair[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();

  useEffect(() => {
    fetch(withActiveProject('/api/admin/project', activeProjectId))
      .then(res => res.json())
      .then(data => { setPairs(data.project?.before_after ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [activeProjectId]);

  const change = (next: BeforeAfterPair[]) => { setPairs(next); setDirty(true); };
  const updateAt = (i: number, updates: Partial<BeforeAfterPair>) => {
    if (!pairs) return;
    change(pairs.map((p, idx) => (idx === i ? { ...p, ...updates } : p)));
  };
  const removeAt = (i: number) => {
    if (!pairs) return;
    change(pairs.filter((_, idx) => idx !== i));
    setEditing(null);
  };
  const addPair = () => {
    const next = [...(pairs ?? []), { label: '', beforeImage: '', afterImage: '' }];
    change(next);
    setEditing(next.length - 1);
  };

  const handleSave = async () => {
    if (!pairs) return;
    setSaving(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ beforeAfter: pairs }),
    });
    setSaving(false);
    if (res.ok) { setDirty(false); toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || !pairs) return (
      <div role="status" aria-label="Cargando" className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
        {Array.from({ length: 2 }, (_, i) => <Skeleton key={i} aria-hidden="true" className="aspect-[16/10] rounded-2xl" />)}
      </div>
    );

  return (
    <m.div {...contentIn} className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="m-0 text-[15px] font-semibold text-gray-900">
          Antes / Después <span className="font-normal text-gray-600">— pares de render y foto real desde el mismo punto</span>
        </h2>
        <button type="button" onClick={addPair} className="min-h-[40px] px-2 text-[13px] font-semibold text-gray-900 hover:text-brand-700">+ Agregar par</button>
      </div>

      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
        {pairs.map((pair, i) => {
          const complete = !!pair.beforeImage && !!pair.afterImage;
          const isEditing = editing === i;
          return (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white overflow-hidden flex flex-col">
              {complete ? (
                // La misma comparación que ve el visitante, para probar el par antes de guardarlo.
                <div className="[&_.shadow-lg]:shadow-none">
                  <BeforeAfterSlider label="" beforeImage={pair.beforeImage} afterImage={pair.afterImage} />
                </div>
              ) : (
                <div className="aspect-[16/10] flex items-center justify-center text-center px-6 text-xs text-gray-600"
                  style={{ background: 'repeating-linear-gradient(135deg, #EFECE6 0 12px, #F5F3EE 12px 24px)' }}>
                  {pair.beforeImage ? 'Falta la foto real (después)' : pair.afterImage ? 'Falta el render (antes)' : 'Subí el render y la foto real'}
                </div>
              )}
              <div className="flex items-center justify-between gap-3 px-4 min-h-[52px]">
                <span className="text-sm font-semibold text-gray-900 truncate">{pair.label || 'Sin etiqueta'}</span>
                <button type="button" onClick={() => setEditing(isEditing ? null : i)} aria-expanded={isEditing}
                  className="min-h-[36px] px-2 text-xs text-gray-600 hover:text-gray-900">{isEditing ? 'Cerrar' : 'Editar'}</button>
              </div>
              {isEditing && (
                <div className="px-4 pb-4 pt-1 border-t border-gray-100 flex flex-col gap-3">
                  <label className="flex flex-col gap-1.5 pt-3">
                    <span className="text-xs font-medium text-gray-700">Etiqueta</span>
                    <input value={pair.label} onChange={e => updateAt(i, { label: e.target.value })} placeholder="Fachada norte, Interior, Patio…" className={fieldClass} />
                  </label>
                  <ImageUploader label="Antes (render)" value={pair.beforeImage} onChange={url => updateAt(i, { beforeImage: url })} folder="before-after" />
                  <ImageUploader label="Después (foto real)" value={pair.afterImage} onChange={url => updateAt(i, { afterImage: url })} folder="before-after" />
                  <button type="button" onClick={() => removeAt(i)} className="self-end min-h-[40px] px-3 rounded-lg text-[13px] font-medium text-red-700 hover:bg-red-50">Borrar par</button>
                </div>
              )}
            </div>
          );
        })}
        <button type="button" onClick={addPair}
          className="min-h-[200px] rounded-2xl border border-dashed border-gray-300 bg-white/40 hover:bg-white hover:border-gray-400 flex flex-col items-center justify-center gap-1 px-6 text-center">
          <span className="text-[13px] font-semibold text-gray-900">Sumá un render y una foto</span>
          <span className="text-xs text-gray-600">Desde el mismo punto, para compararlos deslizando</span>
        </button>
      </div>

      {(dirty || saving) && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 rounded-[14px] bg-gray-900 text-white">
          <span className="text-[13px] text-[#E4E0D8]">Cambios sin guardar en Antes / Después</span>
          <button type="button" onClick={handleSave} disabled={saving}
            className="min-h-[40px] px-4 rounded-lg bg-white text-gray-900 text-sm font-semibold disabled:opacity-60">
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      )}
    </m.div>
  );
}
