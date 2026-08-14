'use client';

import { useState, useRef } from 'react';
import { fixStereoPanorama } from '@/lib/panorama';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
}

// Subida de imagen a Supabase Storage con drag&drop, más un campo de
// texto de respaldo por si quieren pegar una URL externa directamente
// en vez de subir un archivo.
export default function ImageUploader({ value, onChange, folder, label }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    const toUpload = folder === 'tours' ? await fixStereoPanorama(file) : file;
    const formData = new FormData();
    formData.append('file', toUpload);
    formData.append('folder', folder);
    try {
      const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        onChange(data.url);
      } else {
        setError(data.error ?? 'Error al subir el archivo');
      }
    } catch {
      setError('Error de conexión al subir el archivo');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="flex gap-3 items-start">
        <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden shrink-0 flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Subir imagen: arrastrá un archivo o hacé click para elegirlo"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`px-3 py-2.5 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
              ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
          >
            {uploading ? 'Subiendo...' : 'Arrastrá una imagen o hacé click para elegir un archivo'}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = '';
              }}
            />
          </div>
          <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="...o pegá una URL directamente"
            className="w-full text-xs px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-gray-500"
          />
          {folder === 'tours' && !error && (
            <p className="text-[11px] text-gray-400">Si viene en formato estéreo (dos mitades apiladas, una por ojo), la recortamos sola al subir.</p>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
