import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig } from './project-types';
import {
  isSectionAvailable,
  computeEmptySectionKeys,
  resolveSectionOrder,
  resolveSectionList,
  sectionEditHref,
  sectionHint,
  sectionHasContent,
  sectionIsPending,
  summarizeProject,
  resolveVisibleSections,
  SECTION_REGISTRY,
  SECTION_ANCHORS,
  LEGACY_SECTION_ANCHORS,
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
    amenities: [{ images: ['a.png'] }],
    pointsOfInterest: [{ image: 'x.png' }],
    units: [{ status: 'available', price: 100000 }],
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

  it('NUNCA marca "bim" como vacía — mismo criterio que calculator/contact, es opcional y no debe generar un aviso falso', () => {
    const project = {
      description: '', beforeAfter: [], processGallery: [], collaborators: [],
      amenities: [], pointsOfInterest: [], units: [], aerialSlides: [],
    };
    expect(computeEmptySectionKeys(project).has('bim')).toBe(false);
  });

  it('amenidades sin ninguna foto cuentan como vacías (la landing no tiene qué mostrar)', () => {
    expect(computeEmptySectionKeys({ ...full, amenities: [{ images: [] }] }).has('amenities')).toBe(true);
    expect(computeEmptySectionKeys({ ...full, amenities: [{ images: [] }, { images: ['b.png'] }] }).has('amenities')).toBe(false);
  });

  it('una descripción de solo espacios es vacía', () => {
    expect(computeEmptySectionKeys({ ...full, description: '   ' }).has('about')).toBe(true);
  });
});

describe('sectionHasContent / sectionIsPending', () => {
  const base = {
    description: 'x', beforeAfter: [], processGallery: [], collaborators: [],
    amenities: [], pointsOfInterest: [], units: [] as { status: string; price?: number }[], aerialSlides: [],
  };

  it('masterplan necesita al menos una vista aérea', () => {
    expect(sectionHasContent('masterplan', summarizeProject(base))).toBe(false);
    expect(sectionHasContent('masterplan', summarizeProject({ ...base, aerialSlides: [{}] }))).toBe(true);
  });

  it('calculadora solo con unidades disponibles y con precio', () => {
    const sinPrecio = summarizeProject({ ...base, units: [{ status: 'available' }, { status: 'available', price: 0 }] });
    const vendida = summarizeProject({ ...base, units: [{ status: 'sold', price: 90000 }] });
    const ok = summarizeProject({ ...base, units: [{ status: 'available', price: 90000 }] });
    expect(sectionHasContent('calculator', sinPrecio)).toBe(false);
    expect(sectionHasContent('calculator', vendida)).toBe(false);
    expect(sectionHasContent('calculator', ok)).toBe(true);
  });

  it('las opcionales (bim, calculator, contact) nunca quedan pendientes', () => {
    const vacio = summarizeProject(base);
    for (const key of ['bim', 'calculator', 'contact'] as const) {
      expect(sectionIsPending(key, vacio, venta)).toBe(false);
    }
  });

  it('una sección no disponible para el tipo/modo no queda pendiente', () => {
    expect(sectionIsPending('before_after', summarizeProject(base), venta)).toBe(false);
    expect(sectionIsPending('before_after', summarizeProject(base), showcase)).toBe(true);
  });
});

describe('resolveVisibleSections', () => {
  const project = {
    description: 'Un proyecto', beforeAfter: [], processGallery: [], collaborators: [],
    amenities: [{ images: [] }], pointsOfInterest: [], units: [{ status: 'available', price: 120000 }],
    aerialSlides: [], sectionConfig: null,
  };

  it('solo deja las secciones habilitadas, disponibles y con contenido', () => {
    expect(resolveVisibleSections(project, venta)).toEqual(['about', 'typologies', 'calculator', 'contact']);
  });

  it('respeta el orden guardado y las secciones apagadas', () => {
    const conConfig = {
      ...project,
      sectionConfig: [
        { key: 'typologies', enabled: true },
        { key: 'about', enabled: true },
        { key: 'calculator', enabled: false },
      ],
    };
    expect(resolveVisibleSections(conConfig, venta)).toEqual(['typologies', 'about', 'contact']);
  });
});

describe('anclas', () => {
  it('cada sección tiene un ancla única', () => {
    const anchors = SECTION_REGISTRY.map(s => SECTION_ANCHORS[s.key]);
    expect(new Set(anchors).size).toBe(anchors.length);
  });

  it('las anclas viejas no chocan con las nuevas', () => {
    const nuevas = new Set(Object.values(SECTION_ANCHORS));
    for (const vieja of Object.values(LEGACY_SECTION_ANCHORS)) expect(nuevas.has(vieja!)).toBe(false);
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

  it('una key que falta en el guardado se inserta después de su vecina por defecto, habilitada', () => {
    const config = SECTION_REGISTRY.filter(s => s.key !== 'typologies').map(s => ({ key: s.key, enabled: true }));
    const order = resolveSectionOrder(config, venta);
    expect(order.indexOf('typologies')).toBe(order.indexOf('bim') + 1);
  });

  it('una key que falta nunca queda después de Contacto (proyecto viejo sin "bim")', () => {
    const config = SECTION_REGISTRY.filter(s => s.key !== 'bim').map(s => ({ key: s.key, enabled: true }));
    const order = resolveSectionOrder(config, venta);
    expect(order.indexOf('bim')).toBeLessThan(order.indexOf('contact'));
    expect(order.indexOf('bim')).toBe(order.indexOf('masterplan') + 1);
  });

  it('con el masterplan movido al final por el admin, la key nueva igual queda antes de Contacto', () => {
    const config = [
      { key: 'about', enabled: true },
      { key: 'contact', enabled: true },
      { key: 'masterplan', enabled: true },
    ];
    const order = resolveSectionOrder(config, venta);
    expect(order.indexOf('bim')).toBeLessThan(order.indexOf('contact'));
    expect(order[order.length - 1]).toBe('masterplan');
  });

  it('respeta el orden guardado, no el default', () => {
    const config = [
      { key: 'contact', enabled: true },
      { key: 'about', enabled: true },
    ];
    const order = resolveSectionOrder(config, venta);
    expect(order.indexOf('contact')).toBeLessThan(order.indexOf('about'));
  });

  it('descarta keys guardadas que el registro ya no conoce (no rompe la home)', () => {
    const config = [
      { key: 'seccion_vieja', enabled: true },
      { key: 'about', enabled: true },
    ];
    const order = resolveSectionOrder(config, venta);
    expect(order).not.toContain('seccion_vieja');
    expect(order[0]).toBe('about');
  });

  it('si section_config no es un array, usa el orden default', () => {
    const roto = { about: true } as unknown as Parameters<typeof resolveSectionOrder>[0];
    expect(resolveSectionOrder(roto, venta)).toEqual(resolveSectionOrder(null, venta));
  });

  it('ignora entradas sin key y keys duplicadas (gana la primera aparición)', () => {
    const config = [
      { key: 'contact', enabled: false },
      null,
      { enabled: true },
      { key: 'contact', enabled: true },
    ] as unknown as Parameters<typeof resolveSectionOrder>[0];
    const order = resolveSectionOrder(config, venta);
    expect(order).not.toContain('contact');
    expect(new Set(order).size).toBe(order.length);
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
