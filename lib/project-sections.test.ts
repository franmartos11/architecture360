import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig } from './project-types';
import {
  isSectionAvailable,
  computeEmptySectionKeys,
  resolveSectionOrder,
  resolveSectionList,
  sectionEditHref,
  sectionHint,
  SECTION_REGISTRY,
} from './project-sections';

const venta = getProjectTypeConfig('edificio', 'venta'); // showCalculator, showPrice, showLeads todos true
const showcase = getProjectTypeConfig('edificio', 'showcase'); // saleMode showcase
const casa = getProjectTypeConfig('casa', 'venta'); // hasFloorStep false

describe('isSectionAvailable', () => {
  it('before_after / process solo disponibles en modo showcase', () => {
    expect(isSectionAvailable('before_after', showcase)).toBe(true);
    expect(isSectionAvailable('before_after', venta)).toBe(false);
    expect(isSectionAvailable('process', showcase)).toBe(true);
    expect(isSectionAvailable('process', venta)).toBe(false);
  });

  it('calculator sigue el flag showCalculator del tipo', () => {
    expect(isSectionAvailable('calculator', venta)).toBe(venta.showCalculator);
  });

  it('contact sigue el flag showLeads del tipo', () => {
    expect(isSectionAvailable('contact', venta)).toBe(venta.showLeads);
  });

  it('las secciones sin regla de disponibilidad siempre están disponibles', () => {
    for (const key of ['about', 'team', 'amenities', 'masterplan', 'typologies', 'location'] as const) {
      expect(isSectionAvailable(key, venta)).toBe(true);
      expect(isSectionAvailable(key, showcase)).toBe(true);
    }
  });
});

describe('computeEmptySectionKeys', () => {
  const full = {
    description: 'Un proyecto',
    beforeAfter: [{}],
    processGallery: [{}],
    collaborators: [{}],
    amenities: [{}],
    pointsOfInterest: [{ image: 'x.png' }],
    units: [{}],
    aerialSlides: [{}],
  };

  it('proyecto completo: ningún vacío', () => {
    expect(computeEmptySectionKeys(full)).toEqual(new Set());
  });

  it('proyecto vacío: todas las claves chequeadas quedan marcadas', () => {
    const empty = {
      description: '',
      beforeAfter: [],
      processGallery: [],
      collaborators: [],
      amenities: [],
      pointsOfInterest: [],
      units: [],
      aerialSlides: [],
    };
    expect(computeEmptySectionKeys(empty)).toEqual(
      new Set(['about', 'before_after', 'process', 'team', 'amenities', 'typologies', 'location', 'masterplan'])
    );
  });

  it('location solo se marca vacío si NINGÚN punto de interés tiene foto', () => {
    const conFotoParcial = { ...full, pointsOfInterest: [{}, { image: 'x.png' }] };
    expect(computeEmptySectionKeys(conFotoParcial).has('location')).toBe(false);
    const sinFotos = { ...full, pointsOfInterest: [{}, {}] };
    expect(computeEmptySectionKeys(sinFotos).has('location')).toBe(true);
  });
});

describe('resolveSectionOrder', () => {
  it('sin config guardado: usa el orden default, filtrado por disponibilidad', () => {
    const order = resolveSectionOrder(null, venta);
    expect(order).not.toContain('before_after');
    expect(order).not.toContain('process');
    expect(order).toContain('calculator');
    expect(order).toContain('contact');
  });

  it('respeta secciones deshabilitadas', () => {
    const config = SECTION_REGISTRY.map(s => ({ key: s.key, enabled: s.key !== 'amenities' }));
    expect(resolveSectionOrder(config, venta)).not.toContain('amenities');
  });

  it('una key nueva del registro que falta en el guardado se agrega al final, habilitada', () => {
    const config = SECTION_REGISTRY.filter(s => s.key !== 'typologies').map(s => ({ key: s.key, enabled: true }));
    const order = resolveSectionOrder(config, venta);
    expect(order[order.length - 1]).toBe('typologies');
  });

  it('respeta el orden guardado, no el default', () => {
    const config = [
      { key: 'contact', enabled: true },
      { key: 'about', enabled: true },
    ];
    const order = resolveSectionOrder(config, venta);
    expect(order.indexOf('contact')).toBeLessThan(order.indexOf('about'));
  });
});

describe('resolveSectionList', () => {
  it('incluye secciones no disponibles, con su motivo', () => {
    const list = resolveSectionList(null, venta);
    const beforeAfter = list.find(s => s.key === 'before_after')!;
    expect(beforeAfter.available).toBe(false);
    expect(beforeAfter.unavailableReason).toBeTruthy();
  });

  it('secciones disponibles no tienen unavailableReason', () => {
    const list = resolveSectionList(null, venta);
    const about = list.find(s => s.key === 'about')!;
    expect(about.available).toBe(true);
    expect(about.unavailableReason).toBeUndefined();
  });

  it('el label de "masterplan" cambia si el tipo no tiene hasFloorStep', () => {
    const listEdificio = resolveSectionList(null, venta);
    expect(listEdificio.find(s => s.key === 'masterplan')!.label).toBe('Masterplan interactivo');

    const listCasa = resolveSectionList(null, casa);
    expect(listCasa.find(s => s.key === 'masterplan')!.label).toBe('Vista frontal');
  });
});

describe('sectionEditHref', () => {
  it('mapea cada sección a su pantalla de edición', () => {
    expect(sectionEditHref('about', true)).toBe('/admin/proyecto');
    expect(sectionEditHref('amenities', true)).toBe('/admin/proyecto/amenities');
    expect(sectionEditHref('location', true)).toBe('/admin/proyecto/ubicacion');
    expect(sectionEditHref('calculator', true)).toBe('/admin/settings');
    expect(sectionEditHref('contact', true)).toBeNull();
  });

  it('typologies depende de hasFloorStep', () => {
    expect(sectionEditHref('typologies', true)).toBe('/admin/edificios');
    expect(sectionEditHref('typologies', false)).toBe('/admin/inventory');
  });
});

describe('sectionHint', () => {
  it('el hint de masterplan depende de hasUnitStep', () => {
    expect(sectionHint('masterplan', venta)).toMatch(/Vistas aéreas/);
    expect(sectionHint('masterplan', casa)).toMatch(/Vista frontal/);
  });

  it('el hint de typologies menciona precios solo si showPrice está prendido', () => {
    expect(sectionHint('typologies', venta)).toContain('y precios');
    expect(sectionHint('typologies', showcase)).not.toContain('y precios');
  });
});
