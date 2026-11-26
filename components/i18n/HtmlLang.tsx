'use client';

import { useEffect } from 'react';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locales';

// <html lang> lo fija el layout raíz en "es"; leer el idioma ahí volvería
// dinámicas páginas que hoy no lo son. Las páginas en inglés lo ajustan acá
// (además llevan hreflang en la metadata).
export default function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = DEFAULT_LOCALE;
    };
  }, [locale]);
  return null;
}
