import { describe, it, expect } from 'vitest';
import { getProjectTypeConfig } from '@/lib/project-types';
import { UNIT_GROUP_NAV } from './registry';
import type { UnitRow as DbUnitRow } from '@/types/database';

const dwelling = getProjectTypeConfig('edificio', 'venta');
const land = getProjectTypeConfig('loteo', 'venta');

function makeRow(overrides: Partial<DbUnitRow> = {}): DbUnitRow {
  return {
    id: 'u1', floor_id: 'f1', code: 'A01', model_name: 'SUITE', type: '2 dormitorios',
    total_area: 65.5, inner_area: 55, balcony_area: 10.5, external_area: 0,
    bedrooms: 2, bathrooms: 2, has_service_room: false,
    lot_size: null, ceiling_height: null, garage_spaces: 0, garage_type: null,
    garage_covered: 0, garage_uncovered: 0, condition: null, features: [],
    living_rooms: 1, kitchens: 1, other_rooms_count: 0, other_rooms_description: null,
    hoa_fee: null, floors_count: 1,
    price: 150000, currency: 'USD', status: 'available', orientation: 'NE',
    interior_image_url: null, gallery_images: [],
    floor_plan_3d_url: null, plan_3d_url: null, technical_plan_url: null,
    room_plan_image: null, polygon: null, rooms: null, levels: null,
    tour_image_url: null, tour_data: null,
    created_at: '', updated_at: '',
    ...overrides,
  };
}

function find(key: string) {
  const item = UNIT_GROUP_NAV.find(g => g.key === key);
  if (!item) throw new Error(`no existe el grupo ${key}`);
  return item;
}

describe('UNIT_GROUP_NAV.applies', () => {
  it('superficies/planos/ambientes/tour no aplican a un lote', () => {
    for (const key of ['superficies', 'planos', 'ambientes', 'tour']) {
      expect(find(key).applies(land)).toBe(false);
      expect(find(key).applies(dwelling)).toBe(true);
    }
  });

  it('datos e imagenes aplican siempre', () => {
    for (const key of ['datos', 'imagenes']) {
      expect(find(key).applies(land)).toBe(true);
      expect(find(key).applies(dwelling)).toBe(true);
    }
  });
});

describe('UNIT_GROUP_NAV.status', () => {
  it('imagenes: empty / partial / complete', () => {
    const item = find('imagenes');
    expect(item.status(makeRow({ interior_image_url: null, gallery_images: [] }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ interior_image_url: 'x', gallery_images: [] }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ interior_image_url: 'x', gallery_images: ['y'] }), dwelling)).toBe('complete');
  });

  it('planos: cuenta los tres campos', () => {
    const item = find('planos');
    expect(item.status(makeRow({ floor_plan_3d_url: null, plan_3d_url: null, technical_plan_url: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ floor_plan_3d_url: 'a', plan_3d_url: null, technical_plan_url: null }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ floor_plan_3d_url: 'a', plan_3d_url: 'b', technical_plan_url: 'c' }), dwelling)).toBe('complete');
  });

  it('tour: usa getTourStats (nodeCount, orphanCount, hasStart)', () => {
    const item = find('tour');
    expect(item.status(makeRow({ tour_data: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({
      tour_data: { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Living', imageUrl: 'x', linkHotspots: [] }] },
    }), dwelling)).toBe('complete');
    expect(item.status(makeRow({
      tour_data: {
        initialNodeId: '',
        nodes: [
          { id: 'n1', name: 'Living', imageUrl: 'x', linkHotspots: [{ id: 'h1', targetNodeId: 'n2', yaw: 0, pitch: 0 }] as any },
          { id: 'n2', name: 'Cocina', imageUrl: 'y', linkHotspots: [] },
          { id: 'n3', name: 'Baño', imageUrl: 'z', linkHotspots: [] },
        ],
      },
    }), dwelling)).toBe('partial');
  });

  it('ambientes: depende de rooms', () => {
    const item = find('ambientes');
    expect(item.status(makeRow({ rooms: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ rooms: [{ id: 'r1', kind: 'bedroom', name: 'Dorm 1' } as any] }), dwelling)).toBe('complete');
  });

  it('datos: lote depende de total_area; vivienda de orientacion+dormitorios', () => {
    const item = find('datos');
    expect(item.status(makeRow({ total_area: null }), land)).toBe('empty');
    expect(item.status(makeRow({ total_area: 100 }), land)).toBe('complete');
    expect(item.status(makeRow({ model_name: null, type: '' as any }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ model_name: 'X', orientation: null, bedrooms: 0 }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ model_name: 'X', orientation: 'NE', bedrooms: 2 }), dwelling)).toBe('complete');
  });

  it('comercial: depende del precio', () => {
    const item = find('comercial');
    expect(item.status(makeRow({ price: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ price: 1000 }), dwelling)).toBe('complete');
  });

  it('superficies: total_area y luego inner_area', () => {
    const item = find('superficies');
    expect(item.status(makeRow({ total_area: null }), dwelling)).toBe('empty');
    expect(item.status(makeRow({ total_area: 60, inner_area: null }), dwelling)).toBe('partial');
    expect(item.status(makeRow({ total_area: 60, inner_area: 50 }), dwelling)).toBe('complete');
  });
});
