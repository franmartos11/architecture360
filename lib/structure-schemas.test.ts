import { describe, it, expect } from 'vitest';
import {
  buildingPatchSchema, buildingCreateSchema, floorPatchSchema, floorCreateSchema, amenityPatchSchema, amenityCreateSchema,
} from './structure-schemas';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, body: unknown) => schema.safeParse(body).success;

describe('edificios', () => {
  it('acepta lo que manda el panel', () => {
    expect(ok(buildingPatchSchema, { name: 'Torre A', totalFloors: 12, amenitiesTour: null, coverImage: null, tourOrientationDegrees: 90 })).toBe(true);
    expect(ok(buildingCreateSchema, { name: 'Torre A', totalFloors: 1, planImage: null })).toBe(true);
    expect(ok(buildingCreateSchema, { name: 'Torre A' })).toBe(true);
  });
  it('alta: exige nombre', () => {
    expect(ok(buildingCreateSchema, {})).toBe(false);
    expect(ok(buildingCreateSchema, { name: '' })).toBe(false);
  });
  it('descarta el slug y cualquier clave desconocida', () => {
    expect(buildingPatchSchema.parse({ name: 'X', slug: 'otro', project_id: 'p' })).toEqual({ name: 'X' });
  });
});

describe('pisos', () => {
  it('acepta pisos negativos (subsuelos) y el cero', () => {
    expect(ok(floorPatchSchema, { number: -2 })).toBe(true);
    expect(ok(floorPatchSchema, { number: 0 })).toBe(true);
  });
  it('acepta marcadores con campos extra y un plano vacío', () => {
    expect(ok(floorPatchSchema, { planImage: '', unitDots: [{ unitId: 'A1', x: 5, y: 6, color: '#fff', style: 'pill' }] })).toBe(true);
  });
  it.each([
    ['floorKind inventado', { floorKind: 'sotano' }],
    ['number como texto', { number: '3' }],
    ['marcador sin unitId', { unitDots: [{ x: 1, y: 1 }] }],
    ['más de 1000 marcadores', { unitDots: Array(1001).fill({ unitId: 'a', x: 1, y: 1 }) }],
    ['marcadores demasiado pesados', { unitDots: Array(900).fill({ unitId: 'a', x: 1, y: 1, notas: 'x'.repeat(400) }) }],
    ['planImage con javascript:', { planImage: 'javascript:alert(1)' }],
  ])('rechaza %s', (_n, body) => {
    expect(ok(floorPatchSchema, body)).toBe(false);
  });
  it('alta: exige buildingId, number y label', () => {
    expect(ok(floorCreateSchema, { number: 1, label: 'P1' })).toBe(false);
    expect(ok(floorCreateSchema, { buildingId: 'b1', label: 'P1' })).toBe(false);
    expect(ok(floorCreateSchema, { buildingId: 'b1', number: 1 })).toBe(false);
    expect(ok(floorCreateSchema, { buildingId: 'b1', number: 1, label: 'P1' })).toBe(true);
  });
});

describe('amenities', () => {
  it('acepta una amenity completa como la guarda el panel', () => {
    expect(ok(amenityPatchSchema, {
      buildingId: null, name: 'Pileta', description: null, images: ['https://x.supabase.co/a.jpg'], category: 'Aire libre',
      specs: [{ key: 'SUPERFICIE', value: '240 m²' }], location: 'Piso 9', floorId: null, pin: { x: 10, y: 20 },
      polygon: [{ x: 1, y: 1 }, { x: 2, y: 2 }], tourNodeId: null, tour3dUrl: null, sortOrder: 3, visible: true,
    })).toBe(true);
  });
  it('alta: exige nombre', () => {
    expect(ok(amenityCreateSchema, {})).toBe(false);
    expect(ok(amenityCreateSchema, { name: 'Pileta' })).toBe(true);
  });
  it.each([
    ['imágenes con javascript:', { images: ['javascript:alert(1)'] }],
    ['más de 50 imágenes', { images: Array(51).fill('https://a.com/x.jpg') }],
    ['specs con valor numérico', { specs: [{ key: 'a', value: 5 }] }],
    ['más de 100 specs', { specs: Array(101).fill({ key: 'a', value: 'b' }) }],
    ['visible como texto', { visible: 'si' }],
    ['descripción de más de 5000', { description: 'x'.repeat(5001) }],
  ])('rechaza %s', (_n, body) => {
    expect(ok(amenityPatchSchema, body)).toBe(false);
  });
});
