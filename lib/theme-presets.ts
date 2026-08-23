import type { FontKey } from './fonts';

// 6 combinaciones prearmadas de paleta + tipografía + esquineado/espaciado
// para la landing pública. "natural" es literal el look de siempre
// (paleta trevo-* + Montserrat) — es el default cuando un proyecto no
// tiene theme_config, así que ningún sitio existente cambia hasta que
// alguien elija otro preset a propósito.
//
// Invariante que simplifica todo lo que consume esto: `text` siempre es
// legible sobre `bg`/`surface`, y `textOnDark` siempre es legible sobre
// `bgAlt`/`bgAccent` — ningún preset necesita un cuarto color de texto.
// Los "tenues" (textMuted, textOnDarkMuted) y los bordes se derivan con
// alpha en lib/resolve-theme.ts, no se guardan acá.
export interface ThemePreset {
  key: string;
  label: string;
  description: string;
  tokens: {
    bg: string;
    bgAlt: string;
    bgAccent: string;
    surface: string;
    text: string;
    textOnDark: string;
    accent: string;
    /** radio de esquinas, valor CSS (ej. '0px', '1.5rem') */
    radius: string;
    /** padding vertical de sección, valor CSS (ej. '6rem') — densidad del layout */
    spacing: string;
  };
  headingFont: FontKey;
  bodyFont: FontKey;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'natural',
    label: 'Natural',
    description: 'El look de siempre — verdes y tierra, cálido y orgánico.',
    tokens: {
      bg: '#f5f5f5', bgAlt: '#1b1e1c', bgAccent: '#37463f', surface: '#ffffff',
      text: '#1b1e1c', textOnDark: '#ffffff', accent: '#968676',
      radius: '1.25rem', spacing: '6rem',
    },
    headingFont: 'montserrat', bodyFont: 'montserrat',
  },
  {
    key: 'minimalista',
    label: 'Minimalista',
    description: 'Blanco y negro, un solo acento gris, mucho aire.',
    tokens: {
      bg: '#fafafa', bgAlt: '#111111', bgAccent: '#111111', surface: '#ffffff',
      text: '#141414', textOnDark: '#ffffff', accent: '#6b6b6b',
      radius: '0px', spacing: '8rem',
    },
    headingFont: 'inter-tight', bodyFont: 'inter',
  },
  {
    key: 'editorial',
    label: 'Editorial',
    description: 'Marfil y tinta con un acento vino — tono revista de arquitectura.',
    tokens: {
      bg: '#f6f1ea', bgAlt: '#1c1a17', bgAccent: '#5c1f2e', surface: '#ffffff',
      text: '#221f1c', textOnDark: '#f6f1ea', accent: '#8a2f42',
      radius: '0.5rem', spacing: '7rem',
    },
    headingFont: 'fraunces', bodyFont: 'source-serif',
  },
  {
    key: 'brutalista',
    label: 'Brutalista',
    description: 'Blanco y negro sin concesiones, acento óxido, esquinas rectas.',
    tokens: {
      bg: '#ffffff', bgAlt: '#0a0a0a', bgAccent: '#0a0a0a', surface: '#f2f2f2',
      text: '#0a0a0a', textOnDark: '#ffffff', accent: '#c1440e',
      radius: '0px', spacing: '4rem',
    },
    headingFont: 'space-grotesk', bodyFont: 'inter',
  },
  {
    key: 'calido',
    label: 'Cálido',
    description: 'Arena y arcilla, esquinas muy suaves — para reciclaje y rehabilitación.',
    tokens: {
      bg: '#f3e7d8', bgAlt: '#3a2a1e', bgAccent: '#b5652f', surface: '#fff8ef',
      text: '#3a2a1e', textOnDark: '#f3e7d8', accent: '#b5652f',
      radius: '2rem', spacing: '7rem',
    },
    headingFont: 'fraunces', bodyFont: 'karla',
  },
  {
    key: 'nocturno',
    label: 'Nocturno',
    description: 'Casi negro de punta a punta, acento vibrante — para renders dramáticos.',
    tokens: {
      bg: '#121214', bgAlt: '#000000', bgAccent: '#4c1d95', surface: '#1c1c20',
      text: '#f2f2f2', textOnDark: '#ffffff', accent: '#22d3ee',
      radius: '1.25rem', spacing: '6rem',
    },
    headingFont: 'space-grotesk', bodyFont: 'inter',
  },
];

export const DEFAULT_PRESET_KEY = 'natural';

export function getPreset(key: string | undefined): ThemePreset {
  return THEME_PRESETS.find(p => p.key === key) ?? THEME_PRESETS[0];
}
