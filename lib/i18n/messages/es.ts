// Textos fijos del sitio público en castellano: la fuente. Claves planas
// ('zona.cosa'); los plurales llevan _one/_other y se piden por la clave base
// con { count }. Un módulo por zona del sitio (es/*.ts); en.ts arma lo mismo
// en inglés y TypeScript exige exactamente las mismas claves.
import { comun } from './es/comun';
import { sitio } from './es/sitio';
import { plano } from './es/plano';
import { unidad } from './es/unidad';
import { resto } from './es/resto';

export const es = { ...comun, ...sitio, ...plano, ...unidad, ...resto } as const;

export type ClaveCruda = keyof typeof es;
export type Diccionario = Record<ClaveCruda, string>;
