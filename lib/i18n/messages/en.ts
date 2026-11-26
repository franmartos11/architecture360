import type { Diccionario } from './es';
import { comun } from './en/comun';
import { sitio } from './en/sitio';
import { plano } from './en/plano';
import { unidad } from './en/unidad';
import { resto } from './en/resto';

// Textos fijos del sitio público en inglés (mismas claves que es.ts).
export const en: Diccionario = { ...comun, ...sitio, ...plano, ...unidad, ...resto };
