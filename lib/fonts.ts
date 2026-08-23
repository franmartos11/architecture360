import { Montserrat, Inter, Inter_Tight, Space_Grotesk, Fraunces, Source_Serif_4, Karla, Manrope } from 'next/font/google';

// Tipografía curada para el sistema de temas (ver lib/theme-presets.ts) —
// auto-hosteada vía next/font/google, cero requests externos en runtime.
// Cada una se carga UNA sola vez acá y se referencia por variable CSS
// (--font-<key>) desde los presets — así "cambiar de tema" es solo
// cambiar qué variable usa font-family, sin recargar nada.
const montserrat = Montserrat({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'], variable: '--font-montserrat' });
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter-theme' });
const interTight = Inter_Tight({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-inter-tight' });
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-space-grotesk' });
const fraunces = Fraunces({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-fraunces' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-source-serif' });
const karla = Karla({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-karla' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-manrope' });

export type FontKey = 'montserrat' | 'inter' | 'inter-tight' | 'space-grotesk' | 'fraunces' | 'source-serif' | 'karla' | 'manrope';

export interface CuratedFont {
  key: FontKey;
  label: string;
  /** Variable CSS que expone next/font — lo que va del lado derecho de --theme-font-*. */
  cssVar: string;
  /** className de next/font — hay que aplicarlo en algún ancestro para que la variable exista. */
  className: string;
  role: 'heading' | 'body' | 'both';
}

export const CURATED_FONTS: Record<FontKey, CuratedFont> = {
  montserrat: { key: 'montserrat', label: 'Montserrat', cssVar: 'var(--font-montserrat)', className: montserrat.variable, role: 'both' },
  inter: { key: 'inter', label: 'Inter', cssVar: 'var(--font-inter-theme)', className: inter.variable, role: 'body' },
  'inter-tight': { key: 'inter-tight', label: 'Inter Tight', cssVar: 'var(--font-inter-tight)', className: interTight.variable, role: 'heading' },
  'space-grotesk': { key: 'space-grotesk', label: 'Space Grotesk', cssVar: 'var(--font-space-grotesk)', className: spaceGrotesk.variable, role: 'heading' },
  fraunces: { key: 'fraunces', label: 'Fraunces', cssVar: 'var(--font-fraunces)', className: fraunces.variable, role: 'heading' },
  'source-serif': { key: 'source-serif', label: 'Source Serif 4', cssVar: 'var(--font-source-serif)', className: sourceSerif.variable, role: 'body' },
  karla: { key: 'karla', label: 'Karla', cssVar: 'var(--font-karla)', className: karla.variable, role: 'body' },
  manrope: { key: 'manrope', label: 'Manrope', cssVar: 'var(--font-manrope)', className: manrope.variable, role: 'both' },
};

// Todas las variables de fuente juntas, para aplicar en el wrapper de la
// landing — así cualquier preset puede referenciar cualquiera sin
// preocuparse de cuál está "activa".
export const ALL_FONT_CLASSNAMES = Object.values(CURATED_FONTS).map(f => f.className).join(' ');

export function isCuratedFontKey(key: string): key is FontKey {
  return key in CURATED_FONTS;
}
