'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import ImageUploader from '@/components/admin/ImageUploader';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';

interface PortadaForm {
  name: string;
  tagline: string;
  location: string;
  masterplan_image: string;
}

// Nombre, bajada y ubicación del hero + su imagen de fondo — autocontenido
// igual que el resto de components/admin/section-editors/*, mismo motivo
// que AboutEditor: proyecto/page.tsx guarda "Datos generales" junto con
// Ficha académica/Antes-Después/etc. en un solo estado de página, así que
// separar esto ahí sería el refactor grande que veníamos evitando.
export default function PortadaEditor({ onSaved }: { onSaved: () => void }) {
  const [form, setForm] = useState<PortadaForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        const p = data.project ?? {};
        setForm({
          name: p.name ?? '',
          tagline: p.tagline ?? '',
          location: p.location ?? '',
          masterplan_image: p.masterplan_image ?? '',
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    const res = await fetch('/api/admin/project', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        tagline: form.tagline,
        location: form.location,
        masterplanImage: form.masterplan_image,
      }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || !form) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <Input label="Nombre" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />

      <div>
        <Input
          label="Bajada del hero (opcional)"
          value={form.tagline}
          onChange={e => setForm({ ...form, tagline: e.target.value })}
          placeholder="Ej: 3 dormitorios frente al mar en Punta del Este"
          maxLength={140}
        />
        <p className="text-xs text-gray-400 mt-1">Una frase corta debajo del nombre en la portada del sitio.</p>
      </div>

      <Input label="Ubicación" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />

      <ImageUploader
        label="Foto de fondo del hero"
        value={form.masterplan_image}
        onChange={url => setForm({ ...form, masterplan_image: url })}
        folder="masterplan"
      />

      <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  );
}
