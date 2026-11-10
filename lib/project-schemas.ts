import { z } from 'zod';
import { safeUrl, nullable, bounded, tourData } from '@/lib/schema-parts';

// Forma y topes de los blobs JSON del proyecto que PATCH /api/admin/project
// aceptaba como z.unknown(): tema, secciones del sitio, galería de proceso,
// antes/después y el recorrido de áreas comunes. Mismo criterio que
// lib/unit-schema: topes generosos, URLs sin javascript:.

// ─── Tema visual ────────────────────────────────────────────────────
// Los colores vienen de <input type="color"> (#rrggbb) y resolveTheme los asume
// hexadecimales (hexToRgbTriplet). Se aceptan #rgb y #rrggbb.
const hexColor = z.string().regex(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i, 'Color inválido');

// OJO: resolveTheme esparce customColors ENCIMA de los tokens del preset
// ({ ...preset.tokens, ...customColors }), así que una clave de más (radius,
// spacing…) pisaría tokens que no son colores. Por eso este objeto NO es
// loose: solo pasan las 7 claves de color, y el resto se descarta.
const customColors = z.object({
  bg: hexColor, bgAlt: hexColor, bgAccent: hexColor, surface: hexColor,
  text: hexColor, textOnDark: hexColor, accent: hexColor,
}).partial();

// backgroundImageUrl se interpola como url('…') en una variable CSS: una comilla,
// un paréntesis, una barra invertida o un espacio rompería ese valor.
const cssUrl = safeUrl.refine(v => /^[^'"()\\\s]*$/.test(v), 'URL no permitida');

// Mismo formato que ThemePreset.tokens.radius: un valor CSS simple (0px, 0.5rem).
const radius = z.string().regex(/^(0|\d+(\.\d+)?(px|rem|em))?$/, 'Radio inválido');

// Claves de preset y de tipografía (curada, o custom:<id>): nunca llegan a un
// CSS como texto, pero se acotan igual.
const themeKey = z.string().regex(/^[A-Za-z0-9:_-]{1,100}$/, 'Valor inválido');

/** project.theme_config. Las claves que no están acá pasan (el panel puede sumar nuevas), con tope de tamaño. */
export const themeConfigSchema = bounded(
  z.looseObject({
    presetKey: themeKey.optional(),
    headingFont: themeKey.optional(),
    bodyFont: themeKey.optional(),
    customColors: customColors.optional(),
    backgroundImageUrl: cssUrl.optional(),
    radius: radius.optional(),
  }),
  20_000
);

// ─── Secciones del sitio ────────────────────────────────────────────
/** project.section_config: orden y visibilidad de las secciones de la landing. */
export const sectionConfigSchema = z
  .array(z.looseObject({ key: z.string().max(100), enabled: z.boolean() }))
  .max(100);

// ─── Galería de proceso y antes/después ─────────────────────────────
/** project.process_gallery: URLs de imágenes. */
export const processGallerySchema = z.array(safeUrl).max(100);

/** project.before_after: pares { label, beforeImage, afterImage }. */
export const beforeAfterSchema = z
  .array(z.looseObject({ label: z.string().max(200), beforeImage: safeUrl, afterImage: safeUrl }))
  .max(50);

// ─── Recorrido de áreas comunes ─────────────────────────────────────
/** project.common_areas_tour (null = sin recorrido). */
export const commonAreasTourSchema = nullable(tourData);
