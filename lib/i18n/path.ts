// El idioma como primer segmento de la dirección pública del proyecto.
// Castellano no lleva prefijo; /es/... existe solo para redirigir a la
// dirección sin prefijo. Sin imports de next/react (lo usa el proxy).
import { DEFAULT_LOCALE, type Locale } from './locales';

const SEGMENTO = /^\/(en|es)(\/.*)?$/;

export function separarIdioma(pathname: string): { locale: Locale; resto: string; prefijoEs: boolean } {
  const m = pathname.match(SEGMENTO);
  if (!m) return { locale: DEFAULT_LOCALE, resto: pathname, prefijoEs: false };
  const resto = m[2] && m[2] !== '/' ? m[2] : '/';
  return m[1] === 'es' ? { locale: 'es', resto, prefijoEs: true } : { locale: 'en', resto, prefijoEs: false };
}

/** Prefijo de links internos con el idioma: conIdioma('/proyecto/x', 'en') → '/proyecto/x/en'. */
export function conIdioma(base: string, locale: Locale): string {
  return locale === DEFAULT_LOCALE ? base : `${base}/${locale}`;
}

/** El base path sin el segmento de idioma: sinIdioma('/proyecto/x/en', 'en') → '/proyecto/x'. */
export function sinIdioma(basePath: string, locale: Locale): string {
  const sufijo = `/${locale}`;
  return locale !== DEFAULT_LOCALE && basePath.endsWith(sufijo) ? basePath.slice(0, -sufijo.length) : basePath;
}

/**
 * La misma página en otro idioma, con la misma query (?ref=, filtros).
 * `basePathSinIdioma`: '' en subdominio o dominio propio, '/proyecto/slug' si no.
 */
export function hrefOtroIdioma(pathname: string, search: string, basePathSinIdioma: string, a: Locale): string {
  const dentro = pathname.startsWith(basePathSinIdioma) ? pathname.slice(basePathSinIdioma.length) || '/' : pathname;
  const { resto } = separarIdioma(dentro);
  const ruta = `${conIdioma(basePathSinIdioma, a)}${resto === '/' ? '' : resto}` || '/';
  return `${ruta}${search}`;
}
