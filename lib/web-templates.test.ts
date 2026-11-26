import { describe, it, expect } from 'vitest';
import { SECTION_REGISTRY } from './project-sections';
import { WEB_TEMPLATES, buildTemplateSectionConfig, resolveWebTemplateKey } from './web-templates';
import { withPreviewSampleData } from './preview-sample-project';
import { getProjectTypeConfig } from './project-types';
import type { Project } from '@/types';

describe('WEB_TEMPLATES', () => {
  it('incluye exactamente 3 webs predefinidas distintas', () => {
    expect(WEB_TEMPLATES.map(t => t.key)).toEqual(['inmersiva', 'comercial', 'editorial']);
  });

  it('cada web predefinida cubre todas las secciones del registro sin duplicados', () => {
    const registryKeys = SECTION_REGISTRY.map(s => s.key).sort();
    for (const tpl of WEB_TEMPLATES) {
      const built = buildTemplateSectionConfig(tpl.key);
      const keys = built.map(s => s.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect([...keys].sort()).toEqual(registryKeys);
    }
  });

  it('cada web tiene un orden inicial y selección de secciones propios', () => {
    const comercial = buildTemplateSectionConfig('comercial');
    const editorial = buildTemplateSectionConfig('editorial');
    expect(comercial[0].key).toBe('stats');
    expect(editorial[0].key).toBe('about');
    expect(comercial.find(s => s.key === 'faq')?.enabled).toBe(true);
    expect(editorial.find(s => s.key === 'faq')?.enabled).toBe(false);
    expect(editorial.find(s => s.key === 'team')?.enabled).toBe(true);
    expect(comercial.find(s => s.key === 'team')?.enabled).toBe(false);
  });

  it('valores desconocidos caen a inmersiva', () => {
    expect(resolveWebTemplateKey(undefined)).toBe('inmersiva');
    expect(resolveWebTemplateKey('desconocido')).toBe('inmersiva');
  });

  it('withPreviewSampleData completa secciones vacías y respeta datos reales', () => {
    const emptyProject = {
      id: 'p1',
      slug: 'demo',
      name: 'Torre Demo',
      description: '',
      location: 'Córdoba',
      masterplanImage: '',
      projectType: 'edificio',
      saleMode: 'venta',
      processGallery: [],
      beforeAfter: [],
      collaborators: [],
      aerialSlides: [],
      buildings: [],
      units: [],
      amenities: [],
      pointsOfInterest: [],
      bimModels: [],
      locales: ['es'],
    } as Project;
    const { project: filled, usedSample } = withPreviewSampleData(emptyProject, getProjectTypeConfig('edificio', 'venta'));
    expect(usedSample).toBe(true);
    expect(filled.location).toBe('Córdoba');
    expect(filled.units.length).toBeGreaterThan(0);
    expect(filled.amenities.length).toBeGreaterThan(0);
    expect(filled.themeConfig?.faqItems?.length).toBeGreaterThan(0);
    expect(filled.themeConfig?.paymentPlanItems?.length).toBeGreaterThan(0);
    expect(filled.themeConfig?.highlightsItems?.length).toBeGreaterThan(0);
  });
});
