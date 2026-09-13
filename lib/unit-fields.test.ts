import { describe, it, expect } from 'vitest';
import { toFormValues, toDbShape } from './unit-fields';
import type { UnitRow as DbUnitRow } from '@/types/database';

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

describe('toFormValues / toDbShape', () => {
  it('ida y vuelta preserva todos los campos del formulario', () => {
    const row = makeRow();
    const values = toFormValues(row);
    expect(values.code).toBe('A01');
    expect(values.balconyArea).toBe(10.5);
    expect(values.tourData).toBeNull();
    const patch = toDbShape(values);
    expect(patch).toMatchObject({
      code: 'A01', total_area: 65.5, model_name: 'SUITE', type: '2 dormitorios',
      inner_area: 55, balcony_area: 10.5, external_area: 0,
      bedrooms: 2, bathrooms: 2, has_service_room: false, orientation: 'NE',
      price: 150000, currency: 'USD', status: 'available',
    });
  });

  it('preserva balconyArea/externalArea en 0 (no los trata como vacío)', () => {
    const values = toFormValues(makeRow({ balcony_area: 0, external_area: 0 }));
    const patch = toDbShape({ balconyArea: values.balconyArea, externalArea: values.externalArea });
    expect(patch.balcony_area).toBe(0);
    expect(patch.external_area).toBe(0);
  });

  it('toDbShape ignora keys que no son de UnitFormValues', () => {
    const patch = toDbShape({ code: 'B02', notAField: 'x' } as unknown as Partial<import('./unit-fields').UnitFormValues>);
    expect(Object.keys(patch)).toEqual(['code']);
  });

  it('total_area null se preserva (unidad sin superficie cargada)', () => {
    const values = toFormValues(makeRow({ total_area: null }));
    expect(values.totalArea).toBeNull();
    expect(toDbShape({ totalArea: null })).toEqual({ total_area: null });
  });

  it('tourData viaja completo (para que /tour lo persista vía patch)', () => {
    const tourData = { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Living', imageUrl: 'x' }] };
    const values = toFormValues(makeRow({ tour_data: tourData }));
    expect(values.tourData).toEqual(tourData);
    expect(toDbShape({ tourData })).toEqual({ tour_data: tourData });
  });
});
