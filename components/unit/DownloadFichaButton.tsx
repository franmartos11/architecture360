'use client';

import { useSyncExternalStore } from 'react';
import { useTrack } from '@/components/analytics/SiteTracker';
import { currentRef, safeStorage } from '@/lib/analytics/client-state';
import { fichaHref } from '@/lib/ficha/href';
import { useT } from '@/lib/i18n/client';

// "Descargar ficha": PDF de la unidad armado en el servidor. El link suma el
// ref de la inmobiliaria por la que llegó el visitante (se lee del navegador
// después de montar), así el QR de la ficha impresa sigue siendo suyo.
// El texto del botón sigue el idioma de la página; el PDF todavía no (Etapa 3).
// Spec: docs/superpowers/specs/2026-11-24-ficha-pdf-unidad-design.md

const noSubscribe = () => () => {};

function DownloadIcon({ className }: { className: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" />
    </svg>
  );
}

export default function DownloadFichaButton({ projectSlug, unitDbId, unitName, variant }: {
  projectSlug: string;
  unitDbId: string;
  unitName: string;
  variant: 'desktop' | 'mobile';
}) {
  const track = useTrack();
  const t = useT();
  // En el servidor no hay ref; en el navegador se lee de localStorage.
  const ref = useSyncExternalStore(noSubscribe, () => currentRef(safeStorage(), Date.now()), () => null);

  const className = variant === 'mobile'
    ? 'self-start inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#D9DCE1] text-[15px] font-semibold'
    : 'w-full inline-flex items-center justify-center gap-2 py-2 rounded-lg border border-gray-200 text-sm text-gray-700 font-medium hover:bg-gray-50 transition-colors';

  return (
    <a
      href={fichaHref(projectSlug, unitDbId, ref)}
      download
      onClick={e => {
        // En la primera visita el ref se guarda después del primer render:
        // se vuelve a leer al tocar para que el QR no pierda la inmobiliaria.
        e.currentTarget.href = fichaHref(projectSlug, unitDbId, currentRef(safeStorage(), Date.now()));
        track('ficha', { unitId: unitDbId });
      }}
      className={className}
      aria-label={t('unidad.ficha.descargarAria', { nombre: unitName })}
    >
      <DownloadIcon className={variant === 'mobile' ? 'w-5 h-5' : 'w-4 h-4'} />
      {t('unidad.ficha.descargar')}
    </a>
  );
}
