'use client';

import { useState, useEffect } from 'react';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import { useProjectTypeConfig } from '@/lib/project-type-context';

interface AboutForm {
  description: string;
  academic_institution: string;
  academic_career: string;
  academic_tutor: string;
  academic_year: string;
}

const EMPTY: AboutForm = {
  description: '', academic_institution: '', academic_career: '', academic_tutor: '', academic_year: '',
};

// Autocontenido a propósito: no comparte estado con proyecto/page.tsx
// (esa página guarda Datos generales/Ficha académica/etc. juntos desde un
// único estado de página) — acá se hace fetch y PATCH parcial propios,
// solo de los campos que le corresponden a "Sobre el proyecto".
export default function AboutEditor({ onSaved }: { onSaved: () => void }) {
  const { saleMode } = useProjectTypeConfig();
  const [form, setForm] = useState<AboutForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    fetch('/api/admin/project')
      .then(res => res.json())
      .then(data => {
        const p = data.project ?? {};
        setForm({
          description: p.description ?? '',
          academic_institution: p.academic_institution ?? '',
          academic_career: p.academic_career ?? '',
          academic_tutor: p.academic_tutor ?? '',
          academic_year: p.academic_year ?? '',
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
        description: form.description,
        academicInstitution: form.academic_institution,
        academicCareer: form.academic_career,
        academicTutor: form.academic_tutor,
        academicYear: form.academic_year,
      }),
    });
    setSaving(false);
    if (res.ok) { toast('Guardado.'); onSaved(); } else toast('Error al guardar.', 'error');
  };

  if (loading || !form) return <LoadingSpinner text="Cargando..." tone="light" />;

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {saleMode === 'showcase' ? 'Memoria del proyecto' : 'Descripción'}
        </label>
        {saleMode === 'showcase' && (
          <p className="text-xs text-gray-400 mb-2">Concepto, partido, referencias — el texto que explica el proyecto, no solo lo que se ve en las imágenes. Dejá una línea en blanco entre párrafos.</p>
        )}
        <textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          rows={saleMode === 'showcase' ? 10 : 3}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
        />
      </div>

      {saleMode === 'showcase' && (
        <div className="pt-6 border-t border-gray-100 space-y-4">
          <p className="text-sm font-semibold text-gray-900">Ficha académica</p>
          <div className="grid grid-cols-1 gap-4">
            <Input
              label="Institución / Universidad"
              value={form.academic_institution}
              onChange={e => setForm({ ...form, academic_institution: e.target.value })}
              placeholder="Universidad de Buenos Aires"
            />
            <Input
              label="Carrera"
              value={form.academic_career}
              onChange={e => setForm({ ...form, academic_career: e.target.value })}
              placeholder="Arquitectura"
            />
            <Input
              label="Cátedra / Tutor"
              value={form.academic_tutor}
              onChange={e => setForm({ ...form, academic_tutor: e.target.value })}
              placeholder="Cátedra Pérez"
            />
            <Input
              label="Año"
              value={form.academic_year}
              onChange={e => setForm({ ...form, academic_year: e.target.value })}
              placeholder="2025"
            />
          </div>
          <p className="text-xs text-gray-400">
            Los integrantes del proyecto se cargan en <strong>Proyecto → Colaboradores</strong>, por su handle de portfolio. Cada uno confirma su crédito y le queda en su propio portfolio.
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-gray-100 flex items-center justify-end">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>
    </form>
  );
}
