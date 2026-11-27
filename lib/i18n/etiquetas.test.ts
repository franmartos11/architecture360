import { describe, expect, it, vi, afterEach } from 'vitest';
import { etiquetaCatalogo } from './catalogo';
import { getProjectTypeConfig } from '@/lib/project-types';
import {
  cocheraLabel, getStatusLabel, pluralize, roomKindLabel, unitCategoryLabel, categoryShortLabel,
  unitConditionLabel, unitTypeLabel,
} from '@/lib/units';
import { directionCode, directionLabel } from '@/lib/floor-views';
import { floorKindLabel } from '@/lib/floorKinds';
import { poiCategoryLabel } from '@/lib/poiCategories';
import { indexLabel } from '@/lib/financing';
import { formatUpdateDate } from '@/lib/construction-progress';
import { progressHeadline } from '@/lib/construction-progress-view';
import { formatRelativeTime } from '@/lib/relativeTime';
import { exploreGroup, projectSectionFor, type ProjectNavInfo } from '@/lib/project-nav';

afterEach(() => vi.useRealTimers());

describe('catálogo (valores guardados en castellano)', () => {
  it.each([
    ['2 dormitorios', '2 bedrooms'],
    ['1 dormitorio', '1 bedroom'],
    ['monoambiente', 'studio'],
    ['Pileta', 'Pool'],
    ['En suite', 'En suite'],
    ['Con placard', 'Built-in closet'],
    ['Apto crédito', 'Mortgage eligible'],
    ['local comercial', 'commercial unit'],
  ])('%s → %s', (es, en) => {
    expect(etiquetaCatalogo(es, 'en')).toBe(en);
    expect(etiquetaCatalogo(es, 'es')).toBe(es);
  });

  it('un valor fuera del catálogo queda igual', () => {
    expect(etiquetaCatalogo('Algo inventado', 'en')).toBe('Algo inventado');
  });
});

describe('tipo de proyecto', () => {
  it('etiquetas en inglés; en castellano, las de siempre', () => {
    const en = getProjectTypeConfig('edificio', 'venta', 'en');
    expect([en.unitLabel, en.buildingLabel, en.aerialLabel]).toEqual(['Unit', 'Building', 'Aerial view']);
    const lote = getProjectTypeConfig('loteo', 'venta', 'en');
    expect([lote.unitLabel, lote.buildingLabel]).toEqual(['Lot', 'Phase']);
    expect(getProjectTypeConfig('edificio', 'venta').unitLabel).toBe('Unidad');
  });
});

describe('unidades', () => {
  it('plural', () => {
    expect(['Unit', 'Lot', 'House', 'Space', 'Duplex', 'Phase'].map(w => pluralize(w, 'en'))).toEqual(['Units', 'Lots', 'Houses', 'Spaces', 'Duplexes', 'Phases']);
    expect(pluralize('Unidad')).toBe('Unidades');
  });
  it('estado, tipo, condición, categoría, ambientes', () => {
    expect(getStatusLabel('available', 'en')).toBe('Available');
    expect(getStatusLabel('sold', 'en')).toBe('Sold');
    expect(unitTypeLabel('2 dormitorios', 'en')).toBe('2 bedrooms');
    expect(unitTypeLabel('monoambiente', 'en')).toBe('Studio');
    expect(unitTypeLabel('2 dormitorios')).toBe('2 dormitorios');
    expect(unitConditionLabel('a_estrenar', 'en')).toBe('Brand new');
    expect(unitCategoryLabel('comercial', 'en')).toBe('Commercial unit');
    expect(categoryShortLabel('cochera', 'en')).toBe('Parking');
    expect(roomKindLabel('bedroom', 'en')).toBe('Bedroom');
  });
  it('cocheras', () => {
    expect(cocheraLabel({ garageCovered: 1, garageUncovered: 1 }, 'en')).toBe('2 parking spaces (1 covered, 1 uncovered)');
    expect(cocheraLabel({ garageCovered: 1, garageUncovered: 0 }, 'en')).toBe('1 covered parking space');
    expect(cocheraLabel({ garageCovered: 1, garageUncovered: 1 })).toBe('2 cocheras (1 cubierta, 1 descubierta)');
  });
});

describe('otras listas', () => {
  it('orientaciones', () => {
    expect(directionLabel('NO', 'en')).toBe('Northwest');
    expect(directionLabel('NO')).toBe('Noroeste');
    expect(directionCode('SO', 'en')).toBe('SW');
    expect(directionCode('SO')).toBe('SO');
  });
  it('pisos, puntos de interés, índices', () => {
    expect(floorKindLabel('parking', 'en')).toBe('Parking');
    expect(poiCategoryLabel('colegio', 'en')).toBe('Schools');
    expect(indexLabel('ninguno', 'en')).toBe('No adjustment');
    expect(indexLabel('dolar', 'en')).toBe('USD');
  });
});

describe('avance de obra y fechas', () => {
  it('fecha corta', () => {
    expect(formatUpdateDate('2026-03-14', 'en')).toBe('Mar 2026');
    expect(formatUpdateDate('2026-03-14')).toBe('mar 2026');
  });
  it('titular en inglés (la entrega con mes se traduce)', () => {
    const p = { stages: [{ id: 's', label: 'Terminaciones' }], currentStageId: 's', percent: 72, deliveryEstimate: 'Diciembre 2027', updates: [] };
    expect(progressHeadline(p, 'en')).toBe('72% complete · Terminaciones · Estimated delivery December 2027');
    expect(progressHeadline(p)).toBe('72% de avance · Terminaciones · Entrega estimada diciembre 2027');
  });
  it('tiempo relativo', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-25T12:00:00Z'));
    expect(formatRelativeTime('2026-11-25T10:00:00Z', 'en')).toBe('2 hours ago');
    expect(formatRelativeTime('2026-11-25T11:59:58Z', 'en')).toBe('just now');
    expect(formatRelativeTime('2026-11-25T10:00:00Z')).toBe('hace 2 horas');
  });
});

describe('dónde está el visitante (barra)', () => {
  const info = { unitsLabel: 'Units', unitsAvailable: 21, amenitiesCount: 3, explore: {}, buildingNames: {} } as unknown as ProjectNavInfo;
  it('en inglés', () => {
    expect(projectSectionFor('/proyecto/t/en', '/proyecto/t/en', info, 'en')).toEqual({ label: 'Project' });
    expect(projectSectionFor('/proyecto/t/en/unidades', '/proyecto/t/en', info, 'en')).toEqual({ label: 'Units', detail: '21 available' });
    expect(projectSectionFor('/proyecto/t/en/ubicacion', '/proyecto/t/en', info, 'en')).toEqual({ label: 'Location' });
    expect(projectSectionFor('/proyecto/t/en/masterplan', '/proyecto/t/en', info, 'en')).toEqual({ group: 'Explore 3D', label: 'Facade' });
    expect(exploreGroup('en')).toBe('Explore 3D');
  });
  it('en castellano, igual que siempre', () => {
    expect(projectSectionFor('/proyecto/t/unidades', '/proyecto/t', info)).toEqual({ label: 'Units', detail: '21 disponibles' });
  });
});

describe('precios en inglés', () => {
  it('separadores de EE. UU. con cualquier moneda; en castellano, como siempre', async () => {
    const { formatPrice } = await import('@/lib/units');
    expect(formatPrice(85000000, 'ARS', 'en').replace(/\s/g, ' ')).toBe('ARS 85,000,000');
    expect(formatPrice(150000, 'EUR', 'en')).toBe('€150,000');
    expect(formatPrice(120000, 'USD', 'en')).toBe('$120,000');
    expect(formatPrice(85000000, 'ARS')).toBe(new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(85000000));
  });
});

describe('nombres que genera la plataforma (Carga guiada)', () => {
  it('pisos', async () => {
    const { etiquetaPiso } = await import('./catalogo');
    expect(etiquetaPiso('Piso 3', 'en')).toBe('Floor 3');
    expect(etiquetaPiso('Planta baja', 'en')).toBe('Ground floor');
    expect(etiquetaPiso('PB', 'en')).toBe('Ground floor');
    expect(etiquetaPiso('Subsuelo 2', 'en')).toBe('Basement 2');
    expect(etiquetaPiso('Subsuelo', 'en')).toBe('Basement');
    expect(etiquetaPiso('Planta alta', 'en')).toBe('Upper floor');
    expect(etiquetaPiso('Plano', 'en')).toBe('Site plan');
    expect(etiquetaPiso('Terraza Norte', 'en')).toBe('Terraza Norte');
    expect(etiquetaPiso('Piso 3', 'es')).toBe('Piso 3');
  });
  it('tipos por defecto', () => {
    expect(etiquetaCatalogo('Unidad', 'en')).toBe('Unit');
    expect(etiquetaCatalogo('Lote', 'en')).toBe('Lot');
    expect(etiquetaCatalogo('Casa', 'en')).toBe('House');
    expect(etiquetaCatalogo('Dúplex', 'en')).toBe('Duplex');
  });
});
