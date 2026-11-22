import { describe, it, expect } from 'vitest';
import { unitPatchSchema, unitCreateSchema } from './unit-schema';

const ok = (body: unknown) => unitPatchSchema.safeParse(body).success;
const issue = (body: unknown) => {
  const r = unitPatchSchema.safeParse(body);
  return r.success ? null : r.error.issues[0].path.join('.');
};

describe('unitPatchSchema', () => {
  it('acepta lo que manda el panel: números ya convertidos y null para lo vacío', () => {
    expect(ok({
      code: 'A-101', modelName: null, type: '2amb', totalArea: 54.5, innerArea: null, balconyArea: 0, externalArea: 0,
      bedrooms: 2, bathrooms: 1, hasServiceRoom: false, price: null, currency: 'USD', status: 'available',
      galleryImages: ['https://x.supabase.co/a.jpg'], features: ['pileta'], polygon: [{ x: 10, y: 20 }, { x: 30, y: 40 }],
      rooms: null, levels: null, tourData: null, parkingSpots: [],
    })).toBe(true);
  });

  it('un body vacío es válido (PATCH parcial)', () => {
    expect(ok({})).toBe(true);
  });

  it.each([
    ['price negativo', { price: -1 }, 'price'],
    ['price absurdo', { price: 1e15 }, 'price'],
    ['área negativa', { totalArea: -5 }, 'totalArea'],
    ['price como texto', { price: '100' }, 'price'],
    ['dormitorios como texto', { bedrooms: 'dos' }, 'bedrooms'],
    ['código gigante', { code: 'x'.repeat(201) }, 'code'],
    ['modelName gigante', { modelName: 'x'.repeat(501) }, 'modelName'],
    ['features: no es array', { features: 'pileta' }, 'features'],
    ['features: demasiadas', { features: Array(51).fill('a') }, 'features'],
    ['galería con más de 100', { galleryImages: Array(101).fill('https://x.com/a.jpg') }, 'galleryImages'],
    ['polígono con más de 500 puntos', { polygon: Array(501).fill({ x: 1, y: 1 }) }, 'polygon'],
    ['polígono con punto inválido', { polygon: [{ x: 'a', y: 1 }] }, 'polygon.0.x'],
    ['status inventado', { status: 'vendido' }, 'status'],
    ['garageType inventado', { garageType: 'techada' }, 'garageType'],
  ])('rechaza %s', (_n, body, path) => {
    expect(issue(body)).toBe(path);
  });

  it.each(['interiorImageUrl', 'floorPlan3dUrl', 'plan3dUrl', 'technicalPlanUrl', 'roomPlanImage', 'tourImageUrl'])(
    'rechaza javascript: en %s',
    field => {
      expect(ok({ [field]: 'javascript:alert(1)' })).toBe(false);
      expect(ok({ [field]: '  JavaScript:alert(1)' })).toBe(false);
      expect(ok({ [field]: 'https://x.supabase.co/ok.jpg' })).toBe(true);
      expect(ok({ [field]: '/relativa/ok.jpg' })).toBe(true); // datos viejos con otro formato siguen pudiendo guardarse
    }
  );

  it('rechaza javascript: dentro de la galería y de los nodos del tour', () => {
    expect(ok({ galleryImages: ['https://ok.com/a.jpg', 'javascript:alert(1)'] })).toBe(false);
    expect(ok({ tourData: { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Sala', imageUrl: 'javascript:alert(1)' }] } })).toBe(false);
  });

  it('tourData: acepta uno real (con campos extra) y rechaza uno demasiado grande', () => {
    const node = { id: 'n1', name: 'Sala', imageUrl: 'https://x.com/p.jpg', linkHotspots: [{ yaw: 1, pitch: 0, targetNodeId: 'n2' }], note: 'hola' };
    expect(ok({ tourData: { initialNodeId: 'n1', nodes: [node] } })).toBe(true);
    const gordo = { ...node, note: 'x'.repeat(600_000) };
    expect(ok({ tourData: { initialNodeId: 'n1', nodes: [gordo] } })).toBe(false);
  });

  it('rooms y levels: forma mínima y tope de tamaño', () => {
    expect(ok({ rooms: [{ id: 'r1', name: 'Cocina', polygon: [{ x: 1, y: 2 }], kind: 'kitchen', area: 9 }] })).toBe(true);
    expect(ok({ rooms: [{ name: 'sin id' }] })).toBe(false);
    expect(ok({ levels: [{ id: 'l1', label: 'Piso 1', planImage: null, rooms: [] }] })).toBe(true);
    expect(ok({ rooms: [{ id: 'r1', name: 'x', notes: 'y'.repeat(250_000) }] })).toBe(false);
  });

  it('descarta las claves desconocidas (no llegan a la base)', () => {
    const r = unitPatchSchema.parse({ price: 10, id: 'otro', floorId: 'otro-piso', owner_id: 'x', is_admin: true });
    expect(r).toEqual({ price: 10 });
  });
});

describe('unitCreateSchema', () => {
  it('exige floorId, code y type', () => {
    expect(unitCreateSchema.safeParse({ code: 'A1', type: '2amb' }).success).toBe(false);
    expect(unitCreateSchema.safeParse({ floorId: 'f1', type: '2amb' }).success).toBe(false);
    expect(unitCreateSchema.safeParse({ floorId: 'f1', code: 'A1' }).success).toBe(false);
    expect(unitCreateSchema.safeParse({ floorId: 'f1', code: 'A1', type: '2amb' }).success).toBe(true);
  });
});
