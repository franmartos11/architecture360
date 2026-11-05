import localFont from 'next/font/local';

// Tipografía curada para el sistema de temas (ver lib/theme-presets.ts).
// Los archivos viven en app/fonts (subset latin, fuentes variables) en vez
// de bajarse de Google Fonts en cada build: esa descarga fallaba de forma
// intermitente y tiraba el deploy. Cada una se carga UNA sola vez acá y se
// referencia por variable CSS (--font-<key>) desde los presets — así
// "cambiar de tema" es solo cambiar qué variable usa font-family.
const montserrat = localFont({ src: '../app/fonts/montserrat.woff2', weight: '300 700', variable: '--font-montserrat' });
const inter = localFont({ src: '../app/fonts/inter.woff2', weight: '300 800', variable: '--font-inter-theme' });
const interTight = localFont({ src: '../app/fonts/inter-tight.woff2', weight: '400 700', variable: '--font-inter-tight' });
const spaceGrotesk = localFont({ src: '../app/fonts/space-grotesk.woff2', weight: '400 700', variable: '--font-space-grotesk' });
const fraunces = localFont({ src: '../app/fonts/fraunces.woff2', weight: '300 600', variable: '--font-fraunces' });
const sourceSerif = localFont({ src: '../app/fonts/source-serif-4.woff2', weight: '400 600', variable: '--font-source-serif' });
const karla = localFont({ src: '../app/fonts/karla.woff2', weight: '400 700', variable: '--font-karla' });
const manrope = localFont({ src: '../app/fonts/manrope.woff2', weight: '400 700', variable: '--font-manrope' });

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
