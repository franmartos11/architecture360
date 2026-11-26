'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { EditorSkeleton } from '@/components/admin/PanelSkeletons';
import { useThemeSectionEditor } from './theme-section-helper';

export default function VideoEditor({ onSaved }: { onSaved: () => void }) {
  const { themeConfig, loading, saving, savePatch } = useThemeSectionEditor();
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (themeConfig) {
      setTitle(themeConfig.videoBlock?.title ?? '');
      setUrl(themeConfig.videoBlock?.url ?? '');
      setCaption(themeConfig.videoBlock?.caption ?? '');
    }
  }, [themeConfig]);

  if (loading) return <EditorSkeleton rows={3} />;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUrl = url.trim();
    const ok = await savePatch({
      videoBlock: cleanUrl
        ? { url: cleanUrl, title: title.trim() || undefined, caption: caption.trim() || undefined }
        : undefined,
    });
    if (ok) onSaved();
  };

  return (
    <form onSubmit={handleSave} className="p-6 space-y-4">
      <p className="m-0 text-xs text-gray-500">
        Pegá un link de YouTube, Vimeo o un archivo MP4 directo. Si lo dejás vacío, el bloque no se muestra en la web.
      </p>
      <Input
        label="URL del video"
        value={url}
        onChange={e => setUrl(e.target.value)}
        placeholder="https://www.youtube.com/watch?v=..."
      />
      <Input
        label="Título (opcional)"
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Mirá el proyecto en movimiento"
      />
      <Input
        label="Epígrafe (opcional)"
        value={caption}
        onChange={e => setCaption(e.target.value)}
        placeholder="Recorrido 3D y vistas aéreas con drone"
      />
      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar video'}
        </Button>
      </div>
    </form>
  );
}
