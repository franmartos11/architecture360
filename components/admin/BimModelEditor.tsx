'use client';

import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { MAX_GALLERY_IMAGES, bimModelHref, canPublishBimModel } from '@/lib/bim';
import type { BimModel } from '@/types';

const labelStyle = 'block text-xs font-medium text-gray-500 mb-1.5';
const inputStyle =
  'w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none';

export default function BimModelEditor({
  model,
  projects,
  onSaved,
  onDeleted,
}: {
  model: BimModel;
  projects: { id: string; name: string }[];
  onSaved: (updated: BimModel) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(model.title);
  const [description, setDescription] = useState(model.description);
  const [galleryImages, setGalleryImages] = useState(model.galleryImages);
  const [projectId, setProjectId] = useState(model.projectId ?? '');
  const [isPublic, setIsPublic] = useState(model.isPublic);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  // Al cambiar de pieza en la lista, el formulario se recarga con la nueva.
  // (reset intencional al cambiar de `model`, no una sincronización derivable en el render)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setTitle(model.title);
    setDescription(model.description);
    setGalleryImages(model.galleryImages);
    setProjectId(model.projectId ?? '');
    setIsPublic(model.isPublic);
  }, [model]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const publishable = canPublishBimModel({ geometryUrl: model.geometryUrl, galleryImages });
  const tooManyImages = galleryImages.filter(u => u.trim()).length > MAX_GALLERY_IMAGES;

  const save = async () => {
    if (!title.trim()) {
      toast('Ponele un título a la pieza.', 'error');
      return;
    }
    setSaving(true);
    const res = await fetch(`/api/admin/bim/${model.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        galleryImages,
        projectId: projectId || null,
        isPublic,
      }),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? 'No se pudo guardar.', 'error');
      return;
    }
    toast('Guardado.');
    onSaved(data.model as BimModel);
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar "${model.title}"? Se borran también sus imágenes. No se puede deshacer.`)) return;
    setSaving(true);
    const res = await fetch(`/api/admin/bim/${model.id}`, { method: 'DELETE' });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast(data.error ?? 'No se pudo eliminar.', 'error');
      return;
    }
    toast('Pieza eliminada.');
    onDeleted(model.id);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={labelStyle}>Título</label>
        <input value={title} onChange={e => setTitle(e.target.value)} className={inputStyle} />
      </div>

      <div>
        <label className={labelStyle}>Descripción</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={4}
          className={inputStyle}
          placeholder="Qué es, dónde está, en qué software lo modelaste."
        />
      </div>

      <div>
        <MultiImageUploader
          values={galleryImages}
          onChange={setGalleryImages}
          folder={`bim/${model.id}`}
          label={`Imágenes (renders, cortes, láminas) — máximo ${MAX_GALLERY_IMAGES}`}
        />
        {tooManyImages && (
          <p className="text-xs text-red-600 mt-1.5">
            Te pasaste del máximo de {MAX_GALLERY_IMAGES} imágenes.
          </p>
        )}
      </div>

      <div>
        <label className={labelStyle}>Proyecto asociado (opcional)</label>
        <select value={projectId} onChange={e => setProjectId(e.target.value)} className={inputStyle}>
          <option value="">Ninguno — solo en mi portfolio</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1.5">
          Si la asociás, además aparece en la landing de ese proyecto.
        </p>
      </div>

      <label className="flex items-center gap-2.5 text-sm text-gray-700">
        <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} />
        Visible para cualquiera con el link
      </label>

      {!publishable && (
        <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          La pieza no se publica hasta que tenga al menos una imagen o un modelo 3D cargado.
        </p>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button type="button" onClick={save} disabled={saving || tooManyImages}>
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
        {model.status === 'ready' && (
          <a
            href={bimModelHref(model.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver página pública
          </a>
        )}
        <button
          type="button"
          onClick={remove}
          disabled={saving}
          className="ml-auto text-sm text-red-600 hover:text-red-700 disabled:opacity-40"
        >
          Eliminar pieza
        </button>
      </div>
    </div>
  );
}
