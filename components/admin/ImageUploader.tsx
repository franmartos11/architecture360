'use client';

import { useState, useRef } from 'react';
import { preparePanorama } from '@/lib/panorama';
import { uploadViaSignedUrl } from '@/lib/signed-upload';
import { compressImage } from '@/lib/image-compress';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  folder: string;
  label?: string;
  /**
   * El padre puede necesitar saber si esta subida sigue en curso — ej. para
   * deshabilitar un botón "Guardar" que de otro modo se puede tocar antes de
   * que termine (el usuario ve la miniatura "subiendo" pero el value real
   * todavía está vacío) y falla en silencio.
   */
  onUploadingChange?: (uploading: boolean) => void;
  /**
   * Achica la foto en el navegador antes de subirla (lib/image-compress).
   * Apagado por defecto: las panorámicas 360° y los planos necesitan la
   * resolución completa. Para fotos de celular (avance de obra) conviene.
   */
  compress?: boolean;
}

// Subida de imagen a Supabase Storage con drag&drop, más un campo de
// texto de respaldo por si quieren pegar una URL externa directamente
// en vez de subir un archivo.
export default function ImageUploader({
  value,
  onChange,
  folder,
  label,
  onUploadingChange,
  compress = folder !== 'tours' && folder !== 'floorplans',
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const setUploadingState = (value: boolean) => {
    setUploading(value);
    onUploadingChange?.(value);
  };

  const handleFile = async (file: File) => {
    setError('');
    setWarning('');
    setUploadPct(0);
    setUploadingState(true);
    let toUpload = file;
    if (folder === 'tours') {
      // El aviso no bloquea: una panorámica parcial se sube igual.
      const prepared = await preparePanorama(file);
      toUpload = prepared.file;
      if (prepared.warning) setWarning(prepared.warning);
    } else if (compress) {
      toUpload = await compressImage(file);
    }
    const result = await uploadViaSignedUrl<{ url: string }>(
      '/api/admin/upload',
      toUpload,
      { folder },
      { onProgress: pct => setUploadPct(pct) }
    );
    if (result.ok) onChange(result.data.url);
    else setError(result.error);
    setUploadingState(false);
  };

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
      onDrop={e => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
      className={`rounded-lg transition-colors ${dragOver ? 'ring-2 ring-brand-500 bg-brand-50' : ''}`}
    >
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
              ${dragOver ? 'border-brand-500 text-brand-700' : 'border-gray-200 hover:border-gray-300 text-gray-500'}`}
          >
            {uploading ? (
              <div className="space-y-1.5">
                <span>{uploadPct > 0 ? `Subiendo ${uploadPct}%…` : 'Preparando…'}</span>
                <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-900 transition-[width] duration-150"
                    style={{ width: `${Math.max(8, uploadPct)}%` }}
                  />
                </div>
              </div>
            ) : (
              'Arrastrá una imagen o hacé click para elegir un archivo'
            )}
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {showUrlInput ? (
              <input
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder="Pegá una URL directamente"
                autoFocus
                className="w-full text-xs px-2.5 py-1 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none font-mono text-gray-500"
              />
            ) : (
              <button
                type="button"
                onClick={() => setShowUrlInput(true)}
                className="min-h-[32px] text-[11px] text-gray-500 hover:text-gray-700 underline underline-offset-2"
              >
                ...o pegar una URL en cambio
              </button>
            )}
            {value && !uploading && (
              <button
                type="button"
                onClick={() => {
                  setError('');
                  setWarning('');
                  onChange('');
                }}
                className="min-h-[32px] text-[11px] font-medium text-red-700 hover:text-red-800 underline underline-offset-2"
              >
                Quitar
              </button>
            )}
          </div>
          {folder === 'tours' && !error && (
            <p className="text-[11px] text-gray-400">Si viene en formato estéreo (dos mitades apiladas, una por ojo), la recortamos sola al subir.</p>
          )}
          {warning && <p className="text-xs text-amber-600">{warning}</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
