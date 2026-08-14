'use client';

import { useState, useRef } from 'react';
import { fixStereoPanorama } from '@/lib/panorama';

export interface BulkUploadResult {
  fileName: string;
  url: string;
}

interface BulkImageUploaderProps {
  folder: string;
  onComplete: (results: BulkUploadResult[]) => void;
  hint?: string;
}

// Sube varios archivos de una, secuencialmente, y devuelve la lista de
// {fileName, url} para que el padre decida qué hacer con cada uno
// (ej: crear un nodo de tour por imagen).
export default function BulkImageUploader({ folder, onComplete, hint }: BulkImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setError('');
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    const results: BulkUploadResult[] = [];
    const failures: string[] = [];

    for (const file of files) {
      const toUpload = folder === 'tours' ? await fixStereoPanorama(file) : file;
      const formData = new FormData();
      formData.append('file', toUpload);
      formData.append('folder', folder);
      try {
        const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (res.ok) {
          results.push({ fileName: file.name, url: data.url });
        } else {
          failures.push(`${file.name}: ${data.error ?? 'error desconocido'}`);
        }
      } catch {
        failures.push(`${file.name}: error de conexión`);
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setUploading(false);
    if (failures.length > 0) setError(`No se pudieron subir ${failures.length}: ${failures.join('; ')}`);
    if (results.length > 0) onComplete(results);
  };

  return (
    <div>
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => {
          e.preventDefault();
          setDragOver(false);
          if (uploading) return;
          uploadFiles(Array.from(e.dataTransfer.files ?? []));
        }}
        onClick={() => !uploading && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label="Subir varias panorámicas de una, un ambiente por imagen"
        onKeyDown={e => {
          if ((e.key === 'Enter' || e.key === ' ') && !uploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`px-4 py-4 border-2 border-dashed rounded-xl text-center transition-colors text-sm
          ${uploading ? 'cursor-wait opacity-70' : 'cursor-pointer'}
          ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
      >
        {uploading
          ? `Subiendo ${progress.done}/${progress.total}...`
          : 'Arrastrá varias panorámicas acá o hacé click para elegirlas — cada imagen se convierte en un ambiente'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={e => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) uploadFiles(files);
            e.target.value = '';
          }}
        />
      </div>
      {hint && !error && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}
