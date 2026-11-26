import { describe, it, expect } from 'vitest';
import {
  buildReplicationPayload,
  defaultReplicateGroups,
  sameColumnCandidates,
  sameTypologyCandidates,
} from './unit-replicate';
import type { UnitRow } from '@/types/database';

const src = {
  id: 'u1',
  floor_id: 'f1',
  code: '1A',
  status: 'sold',
  price: 150000,
  currency: 'USD',
  polygon: [{ x: 1, y: 1 }],
  parking_spots: [{ floorId: 'sub', polygon: [] }],
  model_name: 'Tipología A',
  type: '2 dormitorios',
  category: 'vivienda',
  room_plan_image: '/plan.png',
  rooms: [{ id: 'r1', name: 'Living' }],
  levels: null,
  floors_count: 1,
  interior_image_url: '/int.jpg',
  gallery_images: ['/g1.jpg'],
  floor_plan_3d_url: null,
  plan_3d_url: null,
  technical_plan_url: null,
  tour_data: { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Living', imageUrl: '/360.jpg' }] },
  tour_image_url: null,
  total_area: 75,
} as unknown as UnitRow;

describe('buildReplicationPayload', () => {
  it('copia solo los grupos elegidos y nunca toca code, status, price, polygon ni parking_spots', () => {
    const p = buildReplicationPayload(src, ['design', 'media', 'tour']);
    expect(p).toMatchObject({
      room_plan_image: '/plan.png',
      rooms: [{ id: 'r1', name: 'Living' }],
      gallery_images: ['/g1.jpg'],
      tour_data: src.tour_data,
    });
    expect(p).not.toHaveProperty('code');
    expect(p).not.toHaveProperty('status');
    expect(p).not.toHaveProperty('price');
    expect(p).not.toHaveProperty('polygon');
    expect(p).not.toHaveProperty('parking_spots');
    expect(p).not.toHaveProperty('total_area');
  });

  it('incluye datos y superficies solo cuando se pide specs', () => {
    const p = buildReplicationPayload(src, ['specs']);
    expect(p).toHaveProperty('total_area', 75);
    expect(p).toHaveProperty('model_name', 'Tipología A');
    expect(p).not.toHaveProperty('room_plan_image');
  });
});

describe('sameTypologyCandidates / sameColumnCandidates', () => {
  const others = [
    { id: 'u1', code: '1A', model_name: 'Tipología A', type: '2 dormitorios', building_id: 'b1' },
    { id: 'u2', code: '2A', model_name: 'Tipología A', type: '2 dormitorios', building_id: 'b1' },
    { id: 'u3', code: '2B', model_name: 'Tipología B', type: '1 dormitorio', building_id: 'b1' },
    { id: 'u4', code: '3A', model_name: 'Tipología A', type: '2 dormitorios', building_id: 'b2' },
  ];

  it('agrupa por model_name en todo el proyecto', () => {
    expect(sameTypologyCandidates(others[0], others).map(u => u.code)).toEqual(['2A', '3A']);
  });

  it('agrupa por sufijo de columna dentro del mismo edificio', () => {
    expect(sameColumnCandidates(others[0], others).map(u => u.code)).toEqual(['2A']);
  });
});

describe('defaultReplicateGroups', () => {
  it('detecta qué grupos tiene cargados la unidad origen', () => {
    expect(defaultReplicateGroups(src)).toEqual(['design', 'media', 'tour']);
    expect(defaultReplicateGroups({ rooms: [], gallery_images: [] })).toEqual([]);
  });
});
