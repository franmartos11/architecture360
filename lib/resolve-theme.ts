import { getPreset } from './theme-presets';
import { CURATED_FONTS, isCuratedFontKey, type FontKey } from './fonts';
import type { ThemeConfig, CustomFont } from '@/types';

// Fuente única de verdad para convertir un ThemeConfig (preset + overrides
// de tipografía) en algo que se pueda aplicar directo como estilo — la usa
// tanto la landing pública (app/proyecto/[slug]/page.tsx) como el preview
// en vivo del admin (/admin/sitio), para que nunca puedan divergir.

export interface ResolvedTheme {
  /** Variables --theme-* para aplicar como `style` en el contenedor raíz. */
  cssVars: Record<string, string>;
  /** @font-face de cualquier tipografía propia usada — vacío si no aplica. */
  fontFaceCss: string;
}

function hexToRgbTriplet(hex: string): string {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `${r}, ${g}, ${b}`;
}

function fontFormatToCssFormat(format: string): string {
  switch (format) {
    case 'woff2': return 'woff2';
    case 'woff': return 'woff';
    case 'otf': return 'opentype';
    default: return 'truetype';
  }
}

function resolveFontFamily(
  fontKey: string | undefined,
  fallbackKey: FontKey,
  ownerFonts: CustomFont[]
): { family: string; fontFaceCss: string } {
  if (fontKey?.startsWith('custom:')) {
    const id = fontKey.slice('custom:'.length);
    const font = ownerFonts.find(f => f.id === id);
    if (font) {
      const family = `custom-font-${font.id}`;
      const fontFaceCss = `@font-face { font-family: '${family}'; src: url('${font.fileUrl}') format('${fontFormatToCssFormat(font.format)}'); font-display: swap; }`;
      return { family: `'${family}', sans-serif`, fontFaceCss };
    }
  }
  const key = fontKey && isCuratedFontKey(fontKey) ? fontKey : fallbackKey;
  return { family: CURATED_FONTS[key].cssVar, fontFaceCss: '' };
}

// Qué tan opaco queda cada plano de color de sección cuando hay fondo de
// pantalla configurado — deja asomar la imagen detrás sin sacrificar
// legibilidad. Texto y acento nunca se tocan, solo los fondos.
const BG_WITH_IMAGE_OPACITY = 94;

export function resolveTheme(themeConfig: ThemeConfig | undefined, ownerFonts: CustomFont[] = []): ResolvedTheme {
  const preset = getPreset(themeConfig?.presetKey);
  const heading = resolveFontFamily(themeConfig?.headingFont, preset.headingFont, ownerFonts);
  const body = resolveFontFamily(themeConfig?.bodyFont, preset.bodyFont, ownerFonts);
  // Los colores personalizados pisan al preset campo por campo — lo que
  // no se personalizó sigue viniendo del preset elegido. El radio de
  // esquinas es un override aparte (no es un color, no vive en
  // customColors) con el mismo criterio: ausente = el del preset.
  const t = { ...preset.tokens, ...themeConfig?.customColors };
  const radius = themeConfig?.radius ?? t.radius;
  const bgImageUrl = themeConfig?.backgroundImageUrl;

  const surfaceColor = (hex: string) =>
    bgImageUrl ? `color-mix(in srgb, ${hex} ${BG_WITH_IMAGE_OPACITY}%, transparent)` : hex;

  const cssVars: Record<string, string> = {
    '--theme-bg': surfaceColor(t.bg),
    '--theme-bg-alt': surfaceColor(t.bgAlt),
    '--theme-bg-accent': surfaceColor(t.bgAccent),
    '--theme-surface': surfaceColor(t.surface),
    '--theme-text': t.text,
    '--theme-text-muted': `rgba(${hexToRgbTriplet(t.text)}, 0.65)`,
    '--theme-text-on-dark': t.textOnDark,
    '--theme-text-on-dark-muted': `rgba(${hexToRgbTriplet(t.textOnDark)}, 0.7)`,
    '--theme-accent': t.accent,
    '--theme-border': `rgba(${hexToRgbTriplet(t.text)}, 0.12)`,
    '--theme-border-on-dark': `rgba(${hexToRgbTriplet(t.textOnDark)}, 0.15)`,
    '--theme-radius': radius,
    '--theme-spacing': t.spacing,
    '--theme-font-heading': heading.family,
    '--theme-font-body': body.family,
    '--theme-bg-image': bgImageUrl ? `url('${bgImageUrl}')` : 'none',
  };

  return { cssVars, fontFaceCss: [heading.fontFaceCss, body.fontFaceCss].filter(Boolean).join('\n') };
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const channels = [0, 2, 4].map(i => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(a: string, b: string): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Aviso rápido tipo WCAG sobre las combinaciones que realmente aparecen en
// la landing (texto sobre fondo, texto sobre fondo oscuro, texto de botón
// sobre el acento) — no es una auditoría completa de accesibilidad, es
// para que un color pisado a mano no rompa la legibilidad sin que nadie
// se dé cuenta. 4.5:1 es el mínimo AA para texto normal; 3:1 para texto
// de botón (más grande/en negrita, mismo criterio que AA para "large text").
export function getContrastWarnings(tokens: { text: string; bg: string; textOnDark: string; bgAlt: string; accent: string }): string[] {
  const issues: string[] = [];
  if (contrastRatio(tokens.text, tokens.bg) < 4.5) issues.push('texto sobre fondo claro');
  if (contrastRatio(tokens.textOnDark, tokens.bgAlt) < 4.5) issues.push('texto sobre fondo oscuro');
  if (contrastRatio(tokens.textOnDark, tokens.accent) < 3) issues.push('texto en botones');
  return issues;
}
