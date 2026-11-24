import { describe, it, expect } from 'vitest';
import type { Floor, FloorViewPhoto } from '@/types';
import { floorViewPhotosSchema, parseStoredViewPhotos, pickUnitView, unitViewDegrees, DIRECTION_LABEL } from './floor-views';

const floor = (number: number, over: Partial<Floor> = {}): Floor => ({
  id: `f${number}`, number, label: `Piso ${number}`, planImage: '', unitDots: [], viewPhotos: [], ...over,
});
const photo = (direction: string, url = `https://x.supabase.co/${direction}.jpg`) => ({ direction, url }) as FloorViewPhoto;

describe('floorViewPhotosSchema', () => {
  it('acepta direcciones únicas de las 8', () => {
    expect(floorViewPhotosSchema.safeParse([photo('N'), photo('SO')]).success).toBe(true);
  });
  it('rechaza dirección repetida, desconocida o URL insegura', () => {
    expect(floorViewPhotosSchema.safeParse([photo('N'), photo('N')]).success).toBe(false);
    expect(floorViewPhotosSchema.safeParse([photo('W')]).success).toBe(false);
    expect(floorViewPhotosSchema.safeParse([{ direction: 'N', url: 'javascript:alert(1)' }]).success).toBe(false);
  });
});

describe('parseStoredViewPhotos', () => {
  it('se queda con lo válido, sin repetidas, en orden de brújula', () => {
    expect(parseStoredViewPhotos([photo('S'), { direction: 'X', url: 'a' }, photo('N'), photo('S', 'https://x.supabase.co/otra.jpg')]))
      .toEqual([photo('N'), photo('S')]);
    expect(parseStoredViewPhotos(null)).toEqual([]);
    expect(parseStoredViewPhotos('basura')).toEqual([]);
  });
});

describe('unitViewDegrees', () => {
  it('grados, cardinal guardado o nada', () => {
    expect(unitViewDegrees({ orientationDegrees: 100 })).toBe(100);
    expect(unitViewDegrees({ orientation: 'SO' })).toBe(225);
    expect(unitViewDegrees({ orientation: 'cualquier cosa' })).toBeNull();
    expect(unitViewDegrees({})).toBeNull();
    expect(unitViewDegrees({ orientation: 'ne' })).toBe(45);
    expect(unitViewDegrees({ orientation: 'Norte' })).toBe(0);
    expect(unitViewDegrees({ orientation: 'NW' })).toBe(315);
    expect(unitViewDegrees({ orientation: 'W' })).toBe(270);
    expect(unitViewDegrees({ orientation: 'toString' })).toBeNull();
  });
});

describe('pickUnitView', () => {
  const unit = { floorId: 'f5', floor: 5, orientationDegrees: 80 };

  it('piso propio: arranca por la orientación más cercana', () => {
    const floors = [floor(5, { viewPhotos: [photo('N'), photo('E'), photo('S')] })];
    const v = pickUnitView(floors, unit)!;
    expect(v.approximate).toBe(false);
    expect(v.floorNumber).toBe(5);
    expect(v.photos.map(p => p.direction)).toEqual(['N', 'E', 'S']);
    expect(v.initialIndex).toBe(1);
    expect(v.photos[1].label).toBe(DIRECTION_LABEL.E);
  });

  it('distancia angular da la vuelta (350° → N)', () => {
    const floors = [floor(5, { viewPhotos: [photo('N'), photo('O')] })];
    expect(pickUnitView(floors, { ...unit, orientationDegrees: 350 })!.initialIndex).toBe(0);
  });

  it('sin orientación: la primera foto', () => {
    const floors = [floor(5, { viewPhotos: [photo('S'), photo('E')] })];
    expect(pickUnitView(floors, { floorId: 'f5', floor: 5 })!.initialIndex).toBe(0);
  });

  it('piso sin vistas: el más cercano, y ante empate el de abajo', () => {
    const floors = [floor(3, { viewPhotos: [photo('N')] }), floor(5), floor(7, { viewPhotos: [photo('N')] })];
    const v = pickUnitView(floors, unit)!;
    expect(v.approximate).toBe(true);
    expect(v.floorNumber).toBe(3);
    expect(pickUnitView([floor(5), floor(8, { viewPhotos: [photo('N')] }), floor(1, { viewPhotos: [photo('N')] })], unit)!.floorNumber).toBe(8);
  });

  it('piso propio no encontrado por id pero mismo número: no es aproximada', () => {
    const v = pickUnitView([floor(5, { id: 'otro-id', viewPhotos: [photo('N')] })], { floorId: 'no-existe', floor: 5 })!;
    expect(v.approximate).toBe(false);
  });

  it('solo panorámica también cuenta', () => {
    const v = pickUnitView([floor(5, { viewPanorama: 'https://x.supabase.co/p.jpg' })], unit)!;
    expect(v.photos).toEqual([]);
    expect(v.panorama).toBe('https://x.supabase.co/p.jpg');
  });

  it('ningún piso con vistas: null', () => {
    expect(pickUnitView([floor(5), floor(6)], unit)).toBeNull();
    expect(pickUnitView([], unit)).toBeNull();
  });

  it('pisos sin el campo (base sin el SQL): null sin romper', () => {
    const legacy = { id: 'f5', number: 5, label: 'Piso 5', planImage: '', unitDots: [] } as unknown as Floor;
    expect(pickUnitView([legacy], unit)).toBeNull();
  });
});
