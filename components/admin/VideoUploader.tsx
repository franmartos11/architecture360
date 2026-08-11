'use client';

import { useState, useRef } from 'react';

interface VideoUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
}

// Igual que ImageUploader pero para video (mp4/webm/mov) — con drag&drop,
// preview reproducible, y un campo de URL de respaldo por si el video
// vive en otro lado (ej: ya lo subieron a un CDN de video).
export default function VideoUploader({ value, onChange, folder, label }: VideoUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError('');
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
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
            <video src={value} muted className="w-full h-full object-cover" />
          ) : (
            <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
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
            aria-label="Subir video: arrastrá un archivo o hacé click para elegirlo"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`px-3 py-2.5 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
              ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
          >
            {uploading ? 'Subiendo...' : 'Arrastrá un video o hacé click para elegir un archivo (mp4/webm/mov, hasta 100MB)'}
            <input
              ref={inputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
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
          <div className="flex gap-1.5">
            <input
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="...o pegá una URL directamente"
              className="w-full text-xs px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-gray-500"
            />
            {value && (
              <button
                type="button"
                onClick={() => onChange('')}
                className="shrink-0 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-red-500 transition-colors"
              >
                Quitar
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
