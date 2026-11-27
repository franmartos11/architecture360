// t(clave, vars): el texto fijo en el idioma pedido. Sin imports de next/react.
import type { Locale } from './locales';
import { es, type ClaveCruda, type Diccionario } from './messages/es';
import { en } from './messages/en';

const DICCIONARIOS: Record<Locale, Diccionario> = { es, en };

type Base<K extends string> = K extends `${infer B}_one` ? B : K extends `${infer B}_other` ? B : K;
/** Una clave del diccionario; los plurales se piden por su base (sin _one/_other). */
export type ClaveMensaje = Base<ClaveCruda>;
export type Vars = Record<string, string | number>;
export type T = (clave: ClaveMensaje, vars?: Vars) => string;

export function crearT(locale: Locale): T {
  const d = DICCIONARIOS[locale] as Record<string, string>;
  return (clave, vars) => {
    const plural = vars && typeof vars.count === 'number' ? `${clave}_${vars.count === 1 ? 'one' : 'other'}` : null;
    // Una clave que solo existe en plural, pedida sin count, usa la forma plural (nunca la clave cruda).
    const texto = (plural && d[plural]) ?? d[clave] ?? d[`${clave}_other`] ?? clave;
    return vars ? texto.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : texto;
  };
}
