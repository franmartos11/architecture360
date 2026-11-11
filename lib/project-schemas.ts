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

// ─── Avance de obra ─────────────────────────────────────────────────
// Solo la FORMA y los topes: el contenido (HTML en los textos, ids
// repetidos, etapas huérfanas, fotos que no son http) lo normaliza después
// parseConstructionProgress. Los topes de acá son más holgados que los de
// lib/construction-progress (MAX_STAGES, MAX_UPDATES…) a propósito: un
// panel que mande de más se recorta en silencio, uno que mande algo
// absurdo (10.000 entradas) se rechaza con 400 antes de tocar nada.
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida');
const progressStage = z.looseObject({
  id: z.string().max(100).optional(),
  label: z.string().max(200),
  from: isoDay.optional(),
  to: isoDay.optional(),
});
const progressUpdate = z.looseObject({
  id: z.string().max(100).optional(),
  date: isoDay,
  stageId: z.string().max(100).optional(),
  title: z.string().max(1000),
  body: z.string().max(5000).optional(),
  images: z.array(safeUrl).max(50),
  video: safeUrl.optional(),
  view: z.string().max(200).optional(),
  draft: z.boolean().optional(),
  notifiedAt: z.string().max(40).optional(),
});
/** project.construction_progress (null = sin avance). 600 KB de JSON como máximo. */
export const constructionProgressSchema = nullable(
  bounded(
    z.looseObject({
      stages: z.array(progressStage).max(50),
      currentStageId: z.string().max(100).optional(),
      percent: z.number().optional(),
      deliveryEstimate: z.string().max(500).optional(),
      startedAt: isoDay.optional(),
      updates: z.array(progressUpdate).max(300),
    }),
    600_000
  )
);

// ─── Recorrido de áreas comunes ─────────────────────────────────────
/** project.common_areas_tour (null = sin recorrido). */
export const commonAreasTourSchema = nullable(tourData);
