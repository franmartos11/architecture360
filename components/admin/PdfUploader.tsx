'use client';

import { useState, useRef } from 'react';
import { uploadViaSignedUrl } from '@/lib/signed-upload';
import { fileNameFromUrl, pdfFileError } from '@/lib/brief';

interface PdfUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
  /** Ver el mismo prop en ImageUploader — mismo motivo. */
  onUploadingChange?: (uploading: boolean) => void;
}

// Igual que VideoUploader pero para un PDF (el brief del proyecto): valida
// tipo y peso antes de subir (16 MB, lo que el bot puede mandar por
// WhatsApp) y, cargado, muestra el nombre con "Ver" y "Quitar".
export default function PdfUploader({ value, onChange, folder, label, onUploadingChange }: PdfUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setUploadingState = (v: boolean) => {
    setUploading(v);
    onUploadingChange?.(v);
  };

  const handleFile = async (file: File) => {
    const invalid = pdfFileError(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    setUploadingState(true);
    const result = await uploadViaSignedUrl<{ url: string }>('/api/admin/upload', file, { folder });
    if (result.ok) onChange(result.data.url);
    else setError(result.error);
    setUploadingState(false);
  };

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <div className="flex gap-3 items-start">
        <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 shrink-0 flex items-center justify-center">
          <svg className={`w-6 h-6 ${value ? 'text-gray-700' : 'text-gray-300'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0 space-y-1.5">
          {value && (
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={fileNameFromUrl(value)}>{fileNameFromUrl(value)}</span>
              <a
                href={value}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Ver
              </a>
              <button
                type="button"
                onClick={() => onChange('')}
                className="shrink-0 text-xs px-2.5 py-1 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-red-500 transition-colors"
              >
                Quitar
              </button>
            </div>
          )}
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
            aria-label="Subir PDF: arrastrá un archivo o hacé click para elegirlo"
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
            className={`px-3 py-2.5 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500
              ${dragOver ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
          >
            {uploading
              ? 'Subiendo...'
              : value
                ? 'Arrastrá otro PDF o hacé click para reemplazarlo (hasta 16 MB)'
                : 'Arrastrá un PDF o hacé click para elegirlo (hasta 16 MB)'}
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
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
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
