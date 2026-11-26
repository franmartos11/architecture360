'use client';

import { useState } from 'react';
import { useToast } from '@/components/ui/ToastProvider';

// "Sitio en inglés": activa /en en el sitio público. Administrador en adelante.
// Spec: docs/superpowers/specs/2026-11-25-multi-idioma-design.md
export default function SitioEnIngles({ projectId, activo, puede }: { projectId: string; activo: boolean; puede: boolean }) {
  const toast = useToast();
  const [on, setOn] = useState(activo);
  const [guardando, setGuardando] = useState(false);

  const cambiar = async (valor: boolean) => {
    setOn(valor);
    setGuardando(true);
    try {
      const res = await fetch(`/api/admin/project/idiomas?projectId=${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingles: valor }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setOn(!valor);
      toast('No se pudo cambiar el idioma del sitio.', 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#ECE9E3] bg-gray-50 px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">Sitio en inglés</div>
        <div className="text-[13px] text-gray-600 mt-0.5">
          Tu sitio también en inglés, en /en, con un selector de idioma. Los textos que cargaste se traducen solos más adelante.
        </div>
      </div>
      <span className="relative shrink-0 w-[46px] h-7 inline-block">
        <input
          type="checkbox"
          role="switch"
          aria-label="Sitio en inglés"
          checked={on}
          disabled={!puede || guardando}
          onChange={(e) => void cambiar(e.target.checked)}
          className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 m-0 disabled:cursor-not-allowed"
        />
        <span aria-hidden="true" className="absolute inset-0 rounded-full bg-gray-300 transition-colors peer-checked:bg-brand-700 peer-disabled:opacity-50" />
        <span aria-hidden="true" className="absolute top-[3px] left-[3px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform peer-checked:translate-x-[18px]" />
      </span>
    </div>
  );
}
