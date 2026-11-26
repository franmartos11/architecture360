'use client';

import { createContext, useContext, useMemo } from 'react';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { crearT, type T } from './t';

// Idioma del sitio público para los Client Components. Lo monta el layout del
// proyecto; sin proveedor (vista previa del panel) es castellano.
type Valor = { locale: Locale; disponibles: Locale[] };
const LocaleContext = createContext<Valor>({ locale: DEFAULT_LOCALE, disponibles: [DEFAULT_LOCALE] });

export function LocaleProvider({ locale, disponibles, children }: Valor & { children: React.ReactNode }) {
  const valor = useMemo(() => ({ locale, disponibles }), [locale, disponibles]);
  return <LocaleContext.Provider value={valor}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Valor {
  return useContext(LocaleContext);
}

export function useT(): T {
  const { locale } = useLocale();
  return useMemo(() => crearT(locale), [locale]);
}
