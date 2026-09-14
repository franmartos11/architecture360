import { describe, it, expect } from 'vitest';
import {
  filtersToQuery,
  filtersFromQuery,
  DEFAULT_UNIT_FILTERS,
  type UnitFilters,
} from './unit-filters-url';

function make(overrides: Partial<UnitFilters> = {}): UnitFilters {
  return { ...DEFAULT_UNIT_FILTERS, ...overrides };
}

describe('filtersToQuery', () => {
  it('sin filtros activos devuelve cadena vacía', () => {
    expect(filtersToQuery(DEFAULT_UNIT_FILTERS)).toBe('');
  });

  it('omite los valores que son el default', () => {
    expect(filtersToQuery(make({ tipo: '2 dormitorios' }))).toBe('tipo=2+dormitorios');
  });

  it('serializa varios filtros a la vez', () => {
    const q = filtersToQuery(make({ edificio: 'b1', precioMax: 150000, favs: true }));
    const params = new URLSearchParams(q);
    expect(params.get('edificio')).toBe('b1');
    expect(params.get('precioMax')).toBe('150000');
    expect(params.get('favs')).toBe('1');
  });

  it('serializa feats como lista separada por comas', () => {
    const q = filtersToQuery(make({ feats: ['plano', 'tour'] }));
    expect(new URLSearchParams(q).get('feats')).toBe('plano,tour');
  });

  it('no serializa feats cuando la lista está vacía', () => {
    expect(filtersToQuery(make({ feats: [] }))).toBe('');
  });

  it('no serializa favs cuando es false', () => {
    expect(filtersToQuery(make({ favs: false }))).toBe('');
  });

  it('no serializa los numéricos cuando son 0', () => {
    expect(filtersToQuery(make({ precioMax: 0, m2Min: 0 }))).toBe('');
  });
});

describe('filtersFromQuery', () => {
  it('sin params devuelve los defaults', () => {
    expect(filtersFromQuery(new URLSearchParams(''))).toEqual(DEFAULT_UNIT_FILTERS);
  });

  it('parsea cada filtro a su tipo', () => {
    const f = filtersFromQuery(new URLSearchParams('edificio=b1&precioMax=150000&m2Min=60&favs=1&feats=plano,tour&orden=precio-asc'));
    expect(f.edificio).toBe('b1');
    expect(f.precioMax).toBe(150000);
    expect(f.m2Min).toBe(60);
    expect(f.favs).toBe(true);
    expect(f.feats).toEqual(['plano', 'tour']);
    expect(f.orden).toBe('precio-asc');
  });

  it('ignora numéricos no parseables y cae al default', () => {
    const f = filtersFromQuery(new URLSearchParams('precioMax=abc&m2Min='));
    expect(f.precioMax).toBe(0);
    expect(f.m2Min).toBe(0);
  });

  it('ida y vuelta preserva los filtros activos', () => {
    const original = make({ edificio: 'b2', tipo: '1 dormitorio', estado: 'available', precioMax: 90000, m2Min: 45, favs: true, feats: ['balcon'], orden: 'm2-desc' });
    expect(filtersFromQuery(new URLSearchParams(filtersToQuery(original)))).toEqual(original);
  });
});
