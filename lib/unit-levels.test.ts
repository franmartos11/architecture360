import { describe, it, expect } from 'vitest';
import type { Room, UnitLevel } from '@/types';
import {
  levelLabel, plantaLabel, ensureLevels, readSlot, modelSlotValue, fillPlantas,
  roomsWithGroups, splitRoomsByGroup, slotCoverage,
  type LevelUnitLike,
} from './unit-levels';

const unit = (over: Partial<LevelUnitLike> = {}): LevelUnitLike => ({
  code: 'D1-A', floors_count: 2, room_plan_image: null, floor_plan_3d_url: null, levels: null, ...over,
});
const room: Room = { id: 'r1', name: 'Dormitorio' } as Room;

describe('levelLabel / plantaLabel', () => {
  it('con 2 plantas la de arriba es "Planta alta"', () => {
    expect(levelLabel(1, 2)).toBe('Planta alta');
  });
  it('con más de 2 plantas se numeran', () => {
    expect(levelLabel(2, 3)).toBe('Piso 2');
  });
  it('la planta 0 es la planta baja', () => {
    expect(plantaLabel(0, 3)).toBe('Planta baja');
    expect(plantaLabel(1, 2)).toBe('Planta alta');
  });
});

describe('ensureLevels', () => {
  it('crea las plantas que faltan', () => {
    expect(ensureLevels(null, 3)).toEqual([
      { id: 'piso-1', label: 'Piso 1', planImage: null, plan3dImage: null, rooms: [] },
      { id: 'piso-2', label: 'Piso 2', planImage: null, plan3dImage: null, rooms: [] },
    ]);
  });
  it('conserva un nivel existente tal cual', () => {
    const existing: UnitLevel = { id: 'x', label: 'Altillo', planImage: 'p', rooms: [room] };
    expect(ensureLevels([existing], 2)[0]).toEqual(existing);
  });
  it('no recorta niveles aunque floorsCount haya bajado', () => {
    const a: UnitLevel = { id: 'a', label: 'A', planImage: null, rooms: [] };
    const b: UnitLevel = { id: 'b', label: 'B', planImage: null, rooms: [] };
    expect(ensureLevels([a, b], 2)).toHaveLength(2);
  });
});

describe('readSlot', () => {
  it('planta baja lee room_plan_image y floor_plan_3d_url', () => {
    const u = unit({ room_plan_image: 'p0', floor_plan_3d_url: 'r0' });
    expect(readSlot(u, 0, 'plano')).toBe('p0');
    expect(readSlot(u, 0, 'render')).toBe('r0');
  });
  it('planta k lee levels[k-1]', () => {
    const u = unit({ levels: [{ id: 'l', label: 'Planta alta', planImage: 'p1', plan3dImage: 'r1', rooms: [] }] });
    expect(readSlot(u, 1, 'plano')).toBe('p1');
    expect(readSlot(u, 1, 'render')).toBe('r1');
  });
  it('planta sin nivel cargado está vacía', () => {
    expect(readSlot(unit(), 1, 'plano')).toBeNull();
  });
});

describe('modelSlotValue', () => {
  it('toma el primer valor y marca las unidades con otro distinto', () => {
    const units = [
      unit({ code: 'A', floor_plan_3d_url: 'r1' }),
      unit({ code: 'B' }),
      unit({ code: 'C', floor_plan_3d_url: 'r2' }),
    ];
    expect(modelSlotValue(units, 0, 'render')).toEqual({ value: 'r1', differing: ['C'] });
  });
});

describe('fillPlantas', () => {
  it('completa todas las plantas de una unidad vacía', () => {
    const res = fillPlantas(unit(), [{ plano: 'p0', render: 'r0' }, { plano: 'p1', render: 'r1' }]);
    expect(res.patch).toEqual({
      roomPlanImage: 'p0',
      floorPlan3dUrl: 'r0',
      levels: [{ id: 'piso-1', label: 'Planta alta', planImage: 'p1', plan3dImage: 'r1', rooms: [] }],
    });
    expect(res.filled).toBe(4);
    expect(res.kept).toEqual([]);
  });

  it('no pisa un render distinto ya cargado y lo informa', () => {
    const res = fillPlantas(unit({ floor_plan_3d_url: 'otro' }), [{ render: 'r0' }]);
    expect(res.patch).not.toHaveProperty('floorPlan3dUrl');
    expect(res.kept).toEqual([{ planta: 0, kind: 'render' }]);
  });

  it('si ya tiene el mismo valor no cuenta ni como completado ni como mantenido', () => {
    const res = fillPlantas(unit({ room_plan_image: 'p0' }), [{ plano: 'p0' }]);
    expect(res.patch).toEqual({});
    expect(res.kept).toEqual([]);
    expect(res.filled).toBe(0);
  });

  it('no crea plantas que la unidad no tiene', () => {
    const res = fillPlantas(unit({ floors_count: 1 }), [{ plano: 'p0' }, { plano: 'p1' }]);
    expect(res.patch).toEqual({ roomPlanImage: 'p0' });
  });

  it('conserva nombre y ambientes de un nivel existente', () => {
    const lvl: UnitLevel = { id: 'x', label: 'Altillo', planImage: null, rooms: [room] };
    const res = fillPlantas(unit({ levels: [lvl] }), [{}, { plano: 'p1' }]);
    expect(res.patch.levels).toEqual([{ ...lvl, planImage: 'p1' }]);
  });

  it('una unidad con levels null y planta faltante la trata como vacía', () => {
    const res = fillPlantas(unit({ floors_count: 3, levels: null }), [{}, {}, { render: 'r2' }]);
    expect(res.patch.levels?.[1]).toMatchObject({ id: 'piso-2', label: 'Piso 2', plan3dImage: 'r2' });
    expect(res.patch.levels?.[0]).toMatchObject({ id: 'piso-1', planImage: null });
  });
});

describe('ambientes de casa por planta', () => {
  type R = Room & { group?: string };
  const r = (id: string, group?: string): R => ({ id, name: id, ...(group ? { group } : {}) } as R);

  it('un group "pa" viejo cae en la primera planta extra', () => {
    expect(roomsWithGroups([r('a', 'pa')], null)[0].group).toBe('nivel-1');
  });

  it('los ambientes de cada nivel vuelven con su group', () => {
    const lvl: UnitLevel = { id: 'x', label: 'Planta alta', planImage: 'p1', rooms: [r('b')] };
    expect(roomsWithGroups([r('a', 'pb')], [lvl]).map(x => [x.id, x.group])).toEqual([['a', 'pb'], ['b', 'nivel-1']]);
  });

  it('al separar, un ambiente de planta alta va al nivel sin tocar su plano', () => {
    const lvl: UnitLevel = { id: 'x', label: 'Planta alta', planImage: 'p1', rooms: [] };
    const out = splitRoomsByGroup([r('a', 'pb'), r('b', 'nivel-1'), r('c', 'ext')], [lvl], 2);
    expect(out.rooms.map(x => x.id)).toEqual(['a', 'c']);
    expect(out.levels[0]).toMatchObject({ id: 'x', planImage: 'p1' });
    expect(out.levels[0].rooms.map(x => x.id)).toEqual(['b']);
  });

  it('ida y vuelta reproduce rooms y levels', () => {
    const rooms = [r('a', 'pb'), r('c', 'ext')];
    const levels: UnitLevel[] = [{ id: 'x', label: 'Planta alta', planImage: 'p1', plan3dImage: 'r1', rooms: [r('b', 'nivel-1')] }];
    expect(splitRoomsByGroup(roomsWithGroups(rooms, levels), levels, 2)).toEqual({ rooms, levels, floorsCount: 2 });
  });
});

describe('correcciones de la revisión', () => {
  type R = Room & { group?: string };
  const r = (id: string, group?: string): R => ({ id, name: id, ...(group ? { group } : {}) } as R);

  it('un ambiente de planta baja sin group se queda en planta baja', () => {
    const bedroom = { id: 'd', name: 'Dormitorio de servicio', kind: 'bedroom' } as R;
    expect(roomsWithGroups([bedroom], null)[0].group).toBe('pb');
  });

  it('separar sin ambientes arriba no inventa una planta alta vacía', () => {
    expect(splitRoomsByGroup([r('a', 'pb')], null, 2).levels).toEqual([]);
  });

  it('separar en una casa de 3 plantas nombra el nivel según la cantidad de plantas', () => {
    expect(splitRoomsByGroup([r('b', 'nivel-1')], null, 3).levels[0].label).toBe('Piso 1');
  });

  it('fillPlantas reemplaza lo que era el valor compartido del modelo (corregir un error)', () => {
    const res = fillPlantas(unit({ floor_plan_3d_url: 'viejo' }), [{ render: 'nuevo' }], [{ render: 'viejo' }]);
    expect(res.patch).toEqual({ floorPlan3dUrl: 'nuevo' });
    expect(res.kept).toEqual([]);
    expect(res.filled).toBe(1);
  });

  it('fillPlantas igual mantiene una imagen propia distinta de la compartida', () => {
    const res = fillPlantas(unit({ floor_plan_3d_url: 'propio' }), [{ render: 'nuevo' }], [{ render: 'viejo' }]);
    expect(res.patch).toEqual({});
    expect(res.kept).toEqual([{ planta: 0, kind: 'render' }]);
  });
});

describe('detalles menores', () => {
  type R = Room & { group?: string };
  const r = (id: string, group?: string): R => ({ id, name: id, ...(group ? { group } : {}) } as R);

  it('separar sube floorsCount si quedan más niveles que plantas declaradas', () => {
    expect(splitRoomsByGroup([r('b', 'nivel-1')], null, 1).floorsCount).toBe(2);
    expect(splitRoomsByGroup([r('a', 'pb')], null, 2).floorsCount).toBe(2);
  });

  it('slotCoverage dice qué unidades tienen el valor y cuáles están vacías', () => {
    const units = [
      unit({ code: 'A', floor_plan_3d_url: 'r1' }),
      unit({ code: 'B' }),
      unit({ code: 'C', floor_plan_3d_url: 'otro' }),
    ];
    expect(slotCoverage(units, 0, 'render', 'r1')).toEqual({ have: ['A'], empty: ['B'] });
  });
});
