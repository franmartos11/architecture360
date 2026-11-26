import 'server-only';
import { headers } from 'next/headers';
import { DEFAULT_LOCALE, isLocale, LOCALE_HEADER, type Locale } from './locales';
import { crearT, type T } from './t';

/** Idioma de esta página pública (lo pone el proxy según la dirección). */
export async function getLocale(): Promise<Locale> {
  const v = (await headers()).get(LOCALE_HEADER);
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT(): Promise<T> {
  return crearT(await getLocale());
}
