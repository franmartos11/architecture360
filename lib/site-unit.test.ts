import { describe, it, expect } from 'vitest';
import type { BimModel, Building, Unit } from '@/types';
import { findSiteUnit, unitBimModel } from './site-unit';

const unit = (over: Partial<Unit>): Unit => ({
  id: '101', dbId: 'u-x', name: '101', buildingId: 'b-norte', floorId: 'f-1', floor: 1, type: '2amb' as Unit['type'],
  totalArea: 50, innerArea: 45, balconyArea: 0, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false,
  status: 'available', ...over,
} as Unit);

const building = (id: string, name: string) => ({ id, name, floors: [] } as unknown as Building);

// Dos torres con la misma numeración: el código solo es único por piso.
const project = {
  buildings: [building('b-norte', 'Torre Norte'), building('b-sur', 'Torre Sur')],
  units: [
    unit({ id: '101', dbId: 'u-norte-101', buildingId: 'b-norte', floorId: 'f-n1' }),
    unit({ id: '102', dbId: 'u-norte-102', buildingId: 'b-norte', floorId: 'f-n1' }),
    unit({ id: '101', dbId: 'u-sur-101', buildingId: 'b-sur', floorId: 'f-s1' }),
    unit({ id: 'PB A', dbId: 'u-sur-pba', buildingId: 'b-sur', floorId: 'f-s0', floor: 0 }),
  ],
};

describe('findSiteUnit', () => {
  it('con el mismo código en dos torres, devuelve la de la torre de la URL', () => {
    expect(findSiteUnit(project, 'b-sur', '101')?.unit.dbId).toBe('u-sur-101');
    expect(findSiteUnit(project, 'b-norte', '101')?.unit.dbId).toBe('u-norte-101');
    expect(findSiteUnit(project, 'b-sur', '101')?.building.name).toBe('Torre Sur');
  });

  it('código que no existe en esa torre: null aunque exista en otra', () => {
    expect(findSiteUnit(project, 'b-sur', '102')).toBeNull();
  });

  it('torre inexistente o sin proyecto: null', () => {
    expect(findSiteUnit(project, 'b-este', '101')).toBeNull();
    expect(findSiteUnit(undefined, 'b-sur', '101')).toBeNull();
  });

  it('decodifica el código de la URL, y uno mal codificado no rompe', () => {
    expect(findSiteUnit(project, 'b-sur', 'PB%20A')?.unit.dbId).toBe('u-sur-pba');
    expect(findSiteUnit(project, 'b-sur', 'PB A')?.unit.dbId).toBe('u-sur-pba');
    expect(findSiteUnit(project, 'b-sur', '%E0%A4%A')).toBeNull();
  });

  it('acepta también el uuid de la unidad (los links del bot de WhatsApp lo usan), siempre dentro de la torre', () => {
    const uuid = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
    const p = { ...project, units: [...project.units, unit({ id: '201', dbId: uuid, buildingId: 'b-sur', floorId: 'f-s2' })] };
    expect(findSiteUnit(p, 'b-sur', uuid)?.unit.id).toBe('201');
    expect(findSiteUnit(p, 'b-norte', uuid)).toBeNull();
  });
});

describe('unitBimModel', () => {
  const model = (over: Partial<BimModel>) => ({ id: 'm', unitIds: [], floorIds: [], ...over } as unknown as BimModel);
  const u = project.units[2]; // 101 de Torre Sur

  it('la pieza asignada a la unidad se busca por su uuid, no por el código', () => {
    const own = model({ id: 'own', unitIds: ['u-sur-101'] });
    const other = model({ id: 'other', unitIds: ['u-norte-101'] });
    expect(unitBimModel([other, own], u)?.id).toBe('own');
  });

  it('si no, la del piso; si no, la general', () => {
    const floor = model({ id: 'floor', floorIds: ['f-s1'] });
    const general = model({ id: 'general' });
    expect(unitBimModel([general, floor], u)?.id).toBe('floor');
    expect(unitBimModel([general], u)?.id).toBe('general');
    expect(unitBimModel([model({ id: 'x', unitIds: ['u-norte-101'] })], u)).toBeUndefined();
    expect(unitBimModel(undefined, u)).toBeUndefined();
  });
});
