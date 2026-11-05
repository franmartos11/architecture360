'use client';

import { useState, useEffect } from 'react';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useToast } from '@/components/ui/ToastProvider';
import { useActiveProjectId, withActiveProject } from '@/lib/active-project-context';
import { useProjectTypeConfig } from '@/lib/project-type-context';
import { resolveSectionList } from '@/lib/project-sections';
import { btnPrimary } from '@/components/admin/panel-ui';

interface Settings {
  interestRate: number;
  maxYears: number;
  minDownPayment: number;
}

// Parámetros de la calculadora de financiación (diseño "Configuración ·
// Comercial"): tres campos compactos que se guardan juntos. Con
// `showSiteToggle` suma el interruptor "Se muestra como sección del sitio",
// que es el mismo enabled de la sección 'calculator' que maneja /admin/sitio
// (por eso no se muestra adentro de Sitio, donde ya está el ojo de la fila).
export default function CalculatorEditor({ onSaved, showSiteToggle }: { onSaved?: () => void; showSiteToggle?: boolean }) {
  const [settings, setSettings] = useState<Settings>({ interestRate: 5.5, maxYears: 30, minDownPayment: 20 });
  const [saved, setSaved] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sectionConfig, setSectionConfig] = useState<{ key: string; enabled: boolean }[] | null>(null);
  const [togglingSection, setTogglingSection] = useState(false);
  const toast = useToast();
  const activeProjectId = useActiveProjectId();
  const typeConfig = useProjectTypeConfig();

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (data && typeof data.interestRate === 'number') {
          const next = { interestRate: data.interestRate, maxYears: data.maxYears, minDownPayment: data.minDownPayment };
          setSettings(next);
          setSaved(next);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!showSiteToggle) return;
    fetch(withActiveProject('/api/admin/project/preview', activeProjectId))
      .then(res => res.json())
      .then(data => {
        if (data?.project) {
          setSectionConfig(resolveSectionList(data.project.sectionConfig, typeConfig).map(({ key, enabled }) => ({ key, enabled })));
        }
      })
      .catch(() => {});
  }, [showSiteToggle, activeProjectId, typeConfig]);

  const dirty = !saved || saved.interestRate !== settings.interestRate || saved.maxYears !== settings.maxYears || saved.minDownPayment !== settings.minDownPayment;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) { setSaved(settings); toast('Calculadora guardada.'); onSaved?.(); } else toast('Error al guardar.', 'error');
    } catch {
      toast('Error de conexión.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const calculatorOn = sectionConfig?.find(s => s.key === 'calculator')?.enabled ?? false;
  const toggleSection = async () => {
    if (!sectionConfig) return;
    const next = sectionConfig.map(s => (s.key === 'calculator' ? { ...s, enabled: !calculatorOn } : s));
    setTogglingSection(true);
    const res = await fetch(withActiveProject('/api/admin/project', activeProjectId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionConfig: next }),
    });
    setTogglingSection(false);
    if (res.ok) setSectionConfig(next);
    else toast('No se pudo cambiar la sección.', 'error');
  };

  if (loading) return <LoadingSpinner text="Cargando calculadora..." tone="light" />;

  const field = (label: string, suffix: string, key: keyof Settings, opts: { step: string; min: number; max: number }) => (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      <span className="flex items-center min-h-[44px] rounded-[10px] border border-gray-300 bg-white focus-within:border-brand-700 focus-within:ring-2 focus-within:ring-brand-500/30">
        <input
          type="number" inputMode="decimal" step={opts.step} min={opts.min} max={opts.max} required
          value={Number.isFinite(settings[key]) ? settings[key] : ''}
          onChange={e => setSettings(s => ({ ...s, [key]: Number(e.target.value) }))}
          className="flex-1 min-w-0 h-full px-3 text-sm text-gray-900 bg-transparent outline-none"
        />
        <span className="pr-3 text-xs text-gray-500">{suffix}</span>
      </span>
    </label>
  );

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-gray-900">Calculadora financiera</span>
          <span className="text-xs text-gray-600">
            {showSiteToggle ? 'Se muestra como sección del sitio' : 'Estos valores se usan para proyectar las cuotas que ve el comprador.'}
          </span>
        </div>
        {showSiteToggle && sectionConfig && (
          <button
            type="button" role="switch" aria-checked={calculatorOn} aria-label="Mostrar la calculadora en el sitio"
            onClick={toggleSection} disabled={togglingSection}
            className={`relative shrink-0 w-11 h-7 rounded-full transition-colors disabled:opacity-60 ${calculatorOn ? 'bg-brand-700' : 'bg-gray-300'}`}
          >
            <span className={`absolute top-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-[left] ${calculatorOn ? 'left-[19px]' : 'left-[3px]'}`} />
          </button>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {field('Anticipo mínimo', '%', 'minDownPayment', { step: '1', min: 0, max: 100 })}
        {field('Plazo máximo', 'años', 'maxYears', { step: '1', min: 1, max: 50 })}
        {field('Tasa anual', '%', 'interestRate', { step: '0.01', min: 0, max: 100 })}
      </div>
      {dirty && (
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Guardando…' : 'Guardar calculadora'}</button>
        </div>
      )}
    </form>
  );
}
