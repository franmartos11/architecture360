import { describe, it, expect } from 'vitest';
import {
  planEdificio, planDuplex, planLoteo, planUnico, countUnits, duplicateCodes,
  positionLetter, towerPrefixes, unitCode, splitQuad, polygonAreaM2, priceForLot, parsePastedPrices, blockOfCode,
  matchRoomByFilename, defaultRoomGroup,
} from './guided-structure';

describe('positionLetter', () => {
  it('A..Z y después AA', () => {
    expect(positionLetter(0)).toBe('A');
    expect(positionLetter(25)).toBe('Z');
    expect(positionLetter(26)).toBe('AA');
  });
});

describe('towerPrefixes', () => {
  it('sin prefijo con una sola torre', () => {
    expect(towerPrefixes(['Torre Norte'])).toEqual(['']);
  });
  it('inicial de la última palabra', () => {
    expect(towerPrefixes(['Torre Norte', 'Torre Sur'])).toEqual(['N-', 'S-']);
  });
  it('cae a T1/T2 si chocan', () => {
    expect(towerPrefixes(['Torre A', 'Torre Alta'])).toEqual(['T1-', 'T2-']);
  });
});

describe('unitCode', () => {
  it('letra, número y propio', () => {
    expect(unitCode('letter', '5', 5, 1)).toBe('5B');
    expect(unitCode('number', '5', 5, 1)).toBe('502');
    expect(unitCode('custom', '5', 5, 1, 'U{piso}-{n}')).toBe('U5-2');
  });
});

describe('planEdificio', () => {
  it('arma PB, pisos tipo y PH con códigos únicos entre torres', () => {
    const plan = planEdificio([
      { name: 'Torre Norte', floors: 7, perFloor: 4, groundFloor: 'amenities', penthouses: 2 },
      { name: 'Torre Sur', floors: 4, perFloor: 4, groundFloor: 'locales', penthouses: 2 },
    ], 'letter');
    expect(countUnits(plan)).toBe(7 * 4 + 2 + 4 * 4 + 2);
    expect(duplicateCodes(plan)).toEqual([]);
    const norte = plan[0];
    expect(norte.floors[0]).toMatchObject({ number: 0, role: 'pb', floorKind: 'amenity', units: [] });
    expect(norte.floors[1].units.map(u => u.code)).toEqual(['N-1A', 'N-1B', 'N-1C', 'N-1D']);
    expect(norte.floors[norte.floors.length - 1]).toMatchObject({ number: 8, role: 'ph' });
    expect(plan[1].floors[0]).toMatchObject({ floorKind: 'other', floorKindDescription: 'Locales' });
  });
  it('sin PB ni PH', () => {
    const plan = planEdificio([{ name: 'Torre', floors: 3, perFloor: 2, groundFloor: 'none', penthouses: 0 }], 'number');
    expect(plan[0].floors.map(f => f.number)).toEqual([1, 2, 3]);
    expect(plan[0].floors[2].units.map(u => u.code)).toEqual(['301', '302']);
  });
});

describe('planEdificio · pisos distintos', () => {
  it('un piso tipo con otra cantidad de unidades', () => {
    const plan = planEdificio([{ name: 'T', floors: 3, perFloor: 4, groundFloor: 'none', penthouses: 0, floorOverrides: { 2: 2 } }], 'letter');
    expect(plan[0].floors.map(f => f.units.length)).toEqual([4, 2, 4]);
    expect(plan[0].floors[1].units.map(u => u.code)).toEqual(['2A', '2B']);
  });
});

describe('planDuplex', () => {
  it('un modelo para todas', () => {
    const plan = planDuplex(3, 2, [{ name: 'Modelo único', bedrooms: 3, bathrooms: 2, floorsCount: 2, innerArea: 142, lotSize: 260, garageSpaces: 1 }]);
    expect(plan).toHaveLength(3);
    expect(plan[2].floors[0].units.map(u => u.code)).toEqual(['D3-A', 'D3-B']);
    expect(plan[0].floors[0].units[1]).toMatchObject({ bedrooms: 3, innerArea: 142, modelName: 'Modelo único' });
  });
  it('una unidad puntual con otro modelo', () => {
    const m = (name: string, bedrooms: number) => ({ name, bedrooms, bathrooms: 1, floorsCount: 2, innerArea: null, lotSize: null, garageSpaces: 0 });
    const plan = planDuplex(2, 2, [m('Frente', 3), m('Fondo', 2)], { 'D2-A': 1 });
    expect(plan[1].floors[0].units.map(u => u.modelName)).toEqual(['Fondo', 'Fondo']);
    expect(plan[0].floors[0].units.map(u => u.modelName)).toEqual(['Frente', 'Fondo']);
  });
  it('modelo por posición', () => {
    const m = (name: string, bedrooms: number) => ({ name, bedrooms, bathrooms: 1, floorsCount: 2, innerArea: null, lotSize: null, garageSpaces: 0 });
    const plan = planDuplex(1, 2, [m('Frente', 3), m('Fondo', 2)]);
    expect(plan[0].floors[0].units.map(u => u.modelName)).toEqual(['Frente', 'Fondo']);
  });
});

describe('planLoteo', () => {
  it('por manzanas', () => {
    const plan = planLoteo({ name: 'Etapa', planImage: 'x', mode: 'blocks', blocks: [{ name: 'Manzana 1', lots: 2 }, { name: 'Mz 2', lots: 1 }], totalLots: 0 });
    expect(plan[0].floors[0].units.map(u => u.code)).toEqual(['Mz1-L01', 'Mz1-L02', 'Mz2-L01']);
    expect(blockOfCode('Mz2-L01')).toBe('Mz2');
  });
  it('numeración corrida', () => {
    const plan = planLoteo({ name: 'Etapa', planImage: null, mode: 'sequential', blocks: [], totalLots: 120 });
    expect(plan[0].floors[0].units[0].code).toBe('L001');
    expect(plan[0].floors[0].units).toHaveLength(120);
  });
});

describe('planUnico', () => {
  it('numera de abajo hacia arriba', () => {
    const plan = planUnico('Biblioteca', [
      { name: 'Terraza', use: 'Expansión', planImage: null },
      { name: 'Planta baja', use: 'Acceso', planImage: 'p' },
    ]);
    expect(plan[0].floors.map(f => [f.label, f.number])).toEqual([['Terraza', 1], ['Planta baja', 0]]);
  });
});

describe('splitQuad', () => {
  const quad = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }];
  it('divide en filas × columnas', () => {
    const lots = splitQuad(quad, 2, 4);
    expect(lots).toHaveLength(8);
    expect(lots[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(lots[0].points[2]).toEqual({ x: 10, y: 10 });
    expect(lots.filter(l => l.corner)).toHaveLength(4);
  });
  it('en U vuelve en la segunda fila', () => {
    const lots = splitQuad(quad, 2, 4, 'u');
    expect(lots[4].points[0]).toEqual({ x: 30, y: 10 });
  });
});

describe('polygonAreaM2', () => {
  it('usa la escala del plano', () => {
    // imagen 1000×500 px, ancho = 200 m → 0,2 m/px. Cuadrado de 10%×20% = 100×100 px = 20×20 m.
    expect(polygonAreaM2([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }], 1000, 500, 200)).toBe(400);
  });
});

describe('priceForLot', () => {
  it('suma los ajustes que aplican', () => {
    const lot = { id: '1', code: 'Mz5-L01', area: 300, corner: true, block: 'Mz5', index: 3 };
    const r = priceForLot(lot, 80, [
      { id: 'a', label: 'Esquina', pct: 10, target: 'corner' },
      { id: 'b', label: 'Laguna', pct: 18, target: 'blocks', blocks: ['Mz5'] },
      { id: 'c', label: 'Lanzamiento', pct: -5, target: 'first', first: 20 },
    ]);
    expect(r.pct).toBe(23);
    expect(r.price).toBe(29500);
  });
  it('sin superficie no hay precio', () => {
    expect(priceForLot({ id: '1', code: 'L1', area: null, corner: false, block: null, index: 0 }, 80, []).price).toBeNull();
  });
});

describe('parsePastedPrices', () => {
  it('entiende tab, punto de miles y símbolos', () => {
    const m = parsePastedPrices('Mz1-L01\tUSD 25.500\nMz1-L02;26500\nbasura\n');
    expect(m.get('Mz1-L01')).toBe(25500);
    expect(m.get('Mz1-L02')).toBe(26500);
    expect(m.size).toBe(2);
  });
});

describe('fotos por ambiente', () => {
  const rooms = [
    { id: 'l', name: 'Living', kind: 'living' },
    { id: 'k', name: 'Cocina', kind: 'kitchen' },
    { id: 'd1', name: 'Dormitorio 1', kind: 'bedroom' },
    { id: 'd2', name: 'Dormitorio 2', kind: 'bedroom' },
    { id: 'b1', name: 'Baño 1', kind: 'bathroom' },
    { id: 'e', name: 'Exterior', kind: 'other' },
  ];
  it('asigna por nombre y por palabra clave con número', () => {
    expect(matchRoomByFilename('Cocina final.jpg', rooms)).toBe('k');
    expect(matchRoomByFilename('dorm2_noche.JPG', rooms)).toBe('d2');
    expect(matchRoomByFilename('dormitorio-1.png', rooms)).toBe('d1');
    expect(matchRoomByFilename('bano.jpg', rooms)).toBe('b1');
    expect(matchRoomByFilename('pileta-atardecer.jpg', rooms)).toBe('e');
  });
  it('el nombre se compara como palabra completa', () => {
    // "dormitorio 12" no es "Dormitorio 1": cae a la regla por número y, como no hay 12, queda a mano.
    expect(matchRoomByFilename('dormitorio 12.jpg', rooms)).toBeNull();
    expect(matchRoomByFilename('salamandra.jpg', [{ id: 's', name: 'Sala', kind: 'other' }])).toBeNull();
    expect(matchRoomByFilename('sala-principal.jpg', [{ id: 's', name: 'Sala', kind: 'other' }])).toBe('s');
  });
  it('sin match claro queda para asignar a mano', () => {
    expect(matchRoomByFilename('IMG_4471.jpg', rooms)).toBeNull();
    expect(matchRoomByFilename('dorm.jpg', rooms)).toBeNull();
  });
  it('planta por defecto', () => {
    expect(defaultRoomGroup({ name: 'Dormitorio 1', kind: 'bedroom' }, 2)).toBe('pa');
    expect(defaultRoomGroup({ name: 'Dormitorio 1', kind: 'bedroom' }, 1)).toBe('pb');
    expect(defaultRoomGroup({ name: 'Jardín', kind: 'other' }, 2)).toBe('ext');
    expect(defaultRoomGroup({ name: 'Baño 2', kind: 'bathroom' }, 2, 1)).toBe('pa');
  });
});
