import { SECTION_REGISTRY, type SectionConfigEntry, type SectionKey } from './project-sections';
import type { WebTemplateKey } from '@/types';

/**
 * Tres webs predefinidas sobre la misma base de proyecto:
 * cada una define una variante visual (Hero, Galería, About) y qué
 * componentes arrancan prendidos y en qué orden en `section_config`.
 * Después, desde /admin/sitio, el usuario puede prender, apagar y mover
 * cualquier sección libremente.
 */
export interface WebTemplatePreset {
  key: WebTemplateKey;
  label: string;
  tagline: string;
  description: string;
  /** Orden y encendido por defecto al aplicar esta web predefinida. */
  defaultSections: { key: SectionKey; enabled: boolean }[];
}

export const DEFAULT_WEB_TEMPLATE: WebTemplateKey = 'inmersiva';

export const WEB_TEMPLATES: WebTemplatePreset[] = [
  {
    key: 'inmersiva',
    label: 'Inmersiva',
    tagline: '360° y experiencia visual',
    description: 'Portada con zoom al scrollear, galería en chevrones y foco en recorrido 360° y masterplan.',
    defaultSections: [
      { key: 'about', enabled: true },
      { key: 'gallery', enabled: true },
      { key: 'highlights', enabled: true },
      { key: 'stats', enabled: true },
      { key: 'masterplan', enabled: true },
      { key: 'amenities', enabled: true },
      { key: 'typologies', enabled: true },
      { key: 'video', enabled: true },
      { key: 'progress', enabled: true },
      { key: 'location', enabled: true },
      { key: 'contact', enabled: true },
      { key: 'qualities', enabled: false },
      { key: 'payment_plan', enabled: false },
      { key: 'faq', enabled: false },
      { key: 'calculator', enabled: false },
      { key: 'bim', enabled: false },
      { key: 'before_after', enabled: false },
      { key: 'process', enabled: false },
      { key: 'team', enabled: false },
      { key: 'comments', enabled: false },
    ],
  },
  {
    key: 'comercial',
    label: 'Comercial',
    tagline: 'Enfocada en ventas',
    description: 'Portada split con precio y disponibilidad arriba, diferenciales, plan de pagos, calidades y FAQ.',
    defaultSections: [
      { key: 'stats', enabled: true },
      { key: 'highlights', enabled: true },
      { key: 'typologies', enabled: true },
      { key: 'masterplan', enabled: true },
      { key: 'payment_plan', enabled: true },
      { key: 'qualities', enabled: true },
      { key: 'amenities', enabled: true },
      { key: 'calculator', enabled: true },
      { key: 'faq', enabled: true },
      { key: 'progress', enabled: true },
      { key: 'location', enabled: true },
      { key: 'contact', enabled: true },
      { key: 'about', enabled: true },
      { key: 'gallery', enabled: false },
      { key: 'video', enabled: false },
      { key: 'bim', enabled: false },
      { key: 'before_after', enabled: false },
      { key: 'process', enabled: false },
      { key: 'team', enabled: false },
      { key: 'comments', enabled: false },
    ],
  },
  {
    key: 'editorial',
    label: 'Editorial',
    tagline: 'Estudio / portfolio',
    description: 'Portada tipográfica tipo revista con ficha técnica, galería en mosaico Bento, relato y equipo.',
    defaultSections: [
      { key: 'about', enabled: true },
      { key: 'highlights', enabled: true },
      { key: 'gallery', enabled: true },
      { key: 'before_after', enabled: true },
      { key: 'process', enabled: true },
      { key: 'qualities', enabled: true },
      { key: 'video', enabled: true },
      { key: 'team', enabled: true },
      { key: 'masterplan', enabled: true },
      { key: 'location', enabled: true },
      { key: 'amenities', enabled: true },
      { key: 'typologies', enabled: true },
      { key: 'progress', enabled: false },
      { key: 'stats', enabled: false },
      { key: 'payment_plan', enabled: false },
      { key: 'calculator', enabled: false },
      { key: 'faq', enabled: false },
      { key: 'bim', enabled: false },
      { key: 'contact', enabled: true },
      { key: 'comments', enabled: false },
    ],
  },
];

export function resolveWebTemplateKey(key: string | undefined | null): WebTemplateKey {
  if (key === 'comercial' || key === 'editorial' || key === 'inmersiva') return key;
  return DEFAULT_WEB_TEMPLATE;
}

export function getWebTemplate(key: string | undefined | null): WebTemplatePreset {
  const k = resolveWebTemplateKey(key);
  return WEB_TEMPLATES.find(t => t.key === k) ?? WEB_TEMPLATES[0];
}

/**
 * Arma un `sectionConfig` completo (incluyendo cualquier sección del registro
 * que pudiera agregarse en el futuro) usando el orden y encendido inicial de
 * la web elegida.
 */
export function buildTemplateSectionConfig(key: WebTemplateKey): SectionConfigEntry[] {
  const preset = getWebTemplate(key);
  const seen = new Set<string>(preset.defaultSections.map(s => s.key));
  const rest = SECTION_REGISTRY
    .filter(s => !seen.has(s.key))
    .map(s => ({ key: s.key, enabled: false }));
  return [...preset.defaultSections.map(s => ({ key: s.key, enabled: s.enabled })), ...rest];
}
