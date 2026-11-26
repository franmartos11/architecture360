'use client';

import { usePathname } from 'next/navigation';
import { useLocale } from '@/lib/i18n/client';
import { hrefOtroIdioma, sinIdioma } from '@/lib/i18n/path';
import type { Locale } from '@/lib/i18n/locales';
import { useProjectBasePath } from '@/lib/project-base-path-context';

// "ES / EN" del sitio público: la misma página en el otro idioma. Solo si el
// proyecto tiene más de un idioma activo. Link común (no del router): cambiar
// de idioma rearma el layout entero.
const NOMBRE: Record<Locale, string> = { es: 'Español', en: 'English' };

export default function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, disponibles } = useLocale();
  const pathname = usePathname();
  const base = sinIdioma(useProjectBasePath(), locale);
  if (disponibles.length < 2) return null;

  return (
    <span className={`inline-flex items-center gap-1 text-[13px] font-semibold ${className}`}>
      {disponibles.map((l, i) => (
        <span key={l} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="opacity-40">/</span>}
          <a
            href={hrefOtroIdioma(pathname, '', base, l)}
            hrefLang={l}
            lang={l}
            aria-label={NOMBRE[l]}
            aria-current={l === locale ? 'true' : undefined}
            // La query (?ref=, filtros) se suma al hacer clic: en el render no se conoce sin Suspense.
            onClick={(e) => {
              e.currentTarget.href = hrefOtroIdioma(pathname, window.location.search, base, l);
            }}
            className={`min-h-[32px] inline-flex items-center px-1 uppercase ${l === locale ? 'underline underline-offset-4' : 'opacity-70 hover:opacity-100'}`}
          >
            {l}
          </a>
        </span>
      ))}
    </span>
  );
}
