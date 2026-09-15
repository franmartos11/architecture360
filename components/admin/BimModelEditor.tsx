'use client';

import { useState, useRef } from 'react';
import { ExternalLink, Upload, CheckCircle, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastProvider';
import MultiImageUploader from '@/components/admin/MultiImageUploader';
import { MAX_GALLERY_IMAGES, MAX_GEOMETRY_BYTES, GEOMETRY_WARN_BYTES, bimModelHref, canPublishBimModel } from '@/lib/bim';
import type { BimModel } from '@/types';

const labelStyle = 'block text-xs font-medium text-gray-500 mb-1.5';
const inputStyle =
  'w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none';

export default function BimModelEditor({
  model,
  onSaved,
  onDeleted,
}: {
  model: BimModel;
  onSaved: (updated: BimModel) => void;
  onDeleted: (id: string) => void;
}) {
  const [title, setTitle] = useState(model.title);
  const [description, setDescription] = useState(model.description);
  const [galleryImages, setGalleryImages] = useState(model.galleryImages);
  const [geometryUrl, setGeometryUrl] = useState(model.geometryUrl);

  const [isPublic, setIsPublic] = useState(model.isPublic);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  // El formulario se recarga con la pieza nueva porque BimAdminClient monta
  // este componente con key={selected.id}: al cambiar de pieza React
  // desmonta y remonta, y los useState de arriba se reinicializan solos con
  // el `model` correspondiente. No hace falta un efecto que copie el prop
  // al estado.

  const publishable = canPublishBimModel({ geometryUrl, galleryImages });
  const tooManyImages = galleryImages.filter(u => u.trim()).length > MAX_GALLERY_IMAGES;

  const uploadModel = async (file: File) => {
    if (file.size > MAX_GEOMETRY_BYTES) {
      toast(`El modelo pesa más de ${MAX_GEOMETRY_BYTES / (1024 * 1024)}MB.`, 'error');
      return;
    }
    if (file.size > GEOMETRY_WARN_BYTES) {
      toast('Modelo grande — puede tardar en subir y en abrir.');
    }

    setUploading(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    // XMLHttpRequest para tener progress — fetch no soporta upload progress.
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    });

    const result = await new Promise<{ ok: boolean; data: Record<string, unknown> }>((resolve) => {
      xhr.addEventListener('load', () => {
        try {
          resolve({ ok: xhr.status >= 200 && xhr.status < 300, data: JSON.parse(xhr.responseText) });
        } catch {
          resolve({ ok: false, data: { error: 'Respuesta inválida del servidor.' } });
        }
      });
      xhr.addEventListener('error', () => resolve({ ok: false, data: { error: 'Error de red.' } }));
      xhr.open('POST', `/api/admin/bim/${model.id}/upload-model`);
      xhr.send(formData);
    });

    setUploading(false);
    setUploadProgress(0);

    if (!result.ok) {
      toast((result.data.error as string) ?? 'No se pudo subir el modelo.', 'error');
      return;
    }

    const updated = result.data.model as BimModel;
    setGeometryUrl(updated.geometryUrl);
    toast('Modelo 3D cargado.');
    onSaved(updated);
  };

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
    if (!confirm(`¿Eliminar "${model.title}"? Esta acción no se puede deshacer.`)) return;
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

      {/* ── Modelo 3D ── */}
      <div>
        <label className={labelStyle}>Modelo 3D (.glb / .gltf)</label>
        {geometryUrl ? (
          <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
            <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-800 flex-1">Modelo 3D cargado</span>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs text-green-700 hover:text-green-900 font-medium"
            >
              Reemplazar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            <Upload className="w-4 h-4" />
            Subir modelo .glb o .gltf
          </button>
        )}

        {uploading && (
          <div className="mt-2 flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-brand-600 animate-spin" />
            <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{uploadProgress}%</span>
          </div>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) uploadModel(file);
            e.target.value = '';
          }}
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
        <Button type="button" onClick={save} disabled={saving || uploading || tooManyImages}>
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
          disabled={saving || uploading}
          className="ml-auto text-sm text-red-600 hover:text-red-700 disabled:opacity-40"
        >
          Eliminar pieza
        </button>
      </div>
    </div>
  );
}
