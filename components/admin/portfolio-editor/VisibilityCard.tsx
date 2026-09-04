'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

interface VisibilityCardProps {
  isPublic: boolean;
  showContact: boolean;
  isIndexed: boolean;
  onChange: (patch: { isPublic?: boolean; showContact?: boolean; isIndexed?: boolean }) => void;
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className="w-[38px] h-[22px] rounded-xl shrink-0 flex p-0.5 transition-colors"
      style={{ background: on ? '#5c7a58' : 'rgba(28,25,23,0.16)', justifyContent: on ? 'flex-end' : 'flex-start' }}
    >
      <span className="w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_3px_rgba(28,26,23,0.25)]" />
    </button>
  );
}

// Visibilidad del portfolio + descarga de CV — rail derecho del editor de
// perfil. Los tres toggles ya existen de verdad (profiles.is_public /
// show_contact / is_indexed, ver supabase/schema.sql), a diferencia del
// mockup donde eran puro estado local.
export default function VisibilityCard({ isPublic, showContact, isIndexed, onChange }: VisibilityCardProps) {
  const [downloading, setDownloading] = useState(false);
  const toast = useToast();

  const items: { key: 'isPublic' | 'showContact' | 'isIndexed'; on: boolean; label: string; hint: string }[] = [
    { key: 'isPublic', on: isPublic, label: 'Portfolio público', hint: 'Cualquiera con el enlace puede verlo.' },
    { key: 'showContact', on: showContact, label: 'Mostrar datos de contacto', hint: 'Email, WhatsApp y redes visibles en tu portfolio.' },
    { key: 'isIndexed', on: isIndexed, label: 'Aparecer en buscadores', hint: 'Google puede indexar tu portfolio.' },
  ];

  const downloadCv = async () => {
    setDownloading(true);
    try {
      const res = await fetch('/api/admin/profile/cv');
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'CV.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast('No se pudo generar el CV.', 'error');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-white border border-[rgba(28,25,23,0.08)] p-4">
      <p className="font-semibold text-[12.5px] text-[#1c1a17]">Visibilidad</p>
      <div className="flex flex-col gap-[11px] mt-[11px]">
        {items.map(item => (
          <div key={item.key} className="flex items-start gap-2.5">
            <Switch on={item.on} onClick={() => onChange({ [item.key]: !item.on })} label={item.label} />
            <div className="min-w-0">
              <p className="font-medium text-[11.5px] text-[#1c1a17]">{item.label}</p>
              <p className="font-light text-[10.5px] leading-[1.45] text-[rgba(28,25,23,0.45)] mt-px">{item.hint}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3.5 pt-3 border-t border-[rgba(28,25,23,0.07)] flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-[#f5f4f0] flex items-center justify-center text-[10px] font-medium text-[rgba(28,25,23,0.5)] shrink-0">PDF</div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-[11.5px] text-[#1c1a17]">Descargar mi CV</p>
          <p className="font-light text-[10.5px] text-[rgba(28,25,23,0.45)]">Con experiencia, obra y certificados</p>
        </div>
        <button
          type="button"
          onClick={downloadCv}
          disabled={downloading}
          className="h-7 px-[11px] rounded-lg border border-[rgba(28,25,23,0.14)] text-[11px] font-medium text-[#1c1a17] hover:bg-[#f5f4f0] transition-colors disabled:opacity-50 shrink-0"
        >
          {downloading ? 'Generando…' : 'Generar'}
        </button>
      </div>
    </div>
  );
}
