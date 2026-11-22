import { describe, it, expect } from 'vitest';
import {
  aerialSlideCreateSchema, aerialSlidePatchSchema, aerialHotspotCreateSchema, aerialHotspotPatchSchema, aerialHotspotBulkSchema,
  poiCreateSchema, poiPatchSchema, leadPatchSchema, activeProjectSchema, projectCreateSchema,
  collaboratorInviteSchema, collaboratorPatchSchema, collaboratorRespondSchema,
} from './content-schemas';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe('vistas aéreas', () => {
  it('aceptan lo que manda el panel', () => {
    expect(ok(aerialSlideCreateSchema, { imageUrl: 'https://x.supabase.co/a.jpg', videoUrl: null, label: 'Norte', sortOrder: 0 })).toBe(true);
    expect(ok(aerialSlideCreateSchema, { imageUrl: 'https://x.com/a.jpg', videoUrl: '', label: 'Norte' })).toBe(true); // '' → la ruta lo guarda como null
    expect(ok(aerialSlidePatchSchema, { label: 'Sur' })).toBe(true);
  });
  it('rechazan javascript: y tipos erróneos', () => {
    expect(ok(aerialSlidePatchSchema, { imageUrl: 'javascript:alert(1)' })).toBe(false);
    expect(ok(aerialSlidePatchSchema, { videoUrl: 'javascript:alert(1)' })).toBe(false);
    expect(ok(aerialSlidePatchSchema, { sortOrder: '1' })).toBe(false);
  });
  it('descartan claves desconocidas', () => {
    expect(aerialSlidePatchSchema.parse({ label: 'x', project_id: 'otro' })).toEqual({ label: 'x' });
  });
});

describe('hotspots', () => {
  it('aceptan un hotspot con y sin polígono', () => {
    expect(ok(aerialHotspotCreateSchema, { slideId: 's', buildingId: 'b', x: 12.5, y: 40 })).toBe(true);
    expect(ok(aerialHotspotCreateSchema, { slideId: 's', buildingId: 'b', x: 1, y: 2, polygon: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })).toBe(true);
    expect(ok(aerialHotspotPatchSchema, { polygon: null })).toBe(true);
  });
  it.each([
    ['x como texto', { slideId: 's', buildingId: 'b', x: '1', y: 2 }],
    ['sin slideId', { buildingId: 'b', x: 1, y: 2 }],
    ['polígono de arreglos', { slideId: 's', buildingId: 'b', x: 1, y: 2, polygon: [[0, 0]] }],
  ])('rechazan %s', (_n, v) => expect(ok(aerialHotspotCreateSchema, v)).toBe(false));
  it('la tanda admite hasta 200 items y no está vacía', () => {
    const item = { slideId: 's', buildingId: 'b', x: 1, y: 2 };
    expect(ok(aerialHotspotBulkSchema, { items: Array(200).fill(item) })).toBe(true);
    expect(ok(aerialHotspotBulkSchema, { items: Array(201).fill(item) })).toBe(false);
    expect(ok(aerialHotspotBulkSchema, { items: [] })).toBe(false);
  });
});

describe('puntos de interés', () => {
  it('aceptan un punto real (coordenadas, minutos numéricos o como texto, categoría válida)', () => {
    expect(ok(poiCreateSchema, { name: 'Colegio', category: 'colegio', latitude: -34.9, longitude: -56.1, walkMinutes: 5, driveMinutes: '2', bikeMinutes: null })).toBe(true);
  });
  it.each([
    ['categoría inventada', { category: 'bar' }],
    ['latitud fuera de rango', { latitude: 91 }],
    ['longitud fuera de rango', { longitude: 181 }],
    ['minutos negativos', { walkMinutes: -1 }],
    ['minutos con texto raro', { walkMinutes: '5 min' }],
    ['imagen con javascript:', { image: 'javascript:alert(1)' }],
    ['descripción de más de 2000', { description: 'x'.repeat(2001) }],
  ])('rechazan %s', (_n, v) => expect(ok(poiPatchSchema, v)).toBe(false));
});

describe('lead, proyecto activo y alta de proyecto', () => {
  it('lead: solo el estado, y es un enum', () => {
    expect(leadPatchSchema.parse({ status: 'nuevo', email: 'x' })).toEqual({ status: 'nuevo' });
    expect(ok(leadPatchSchema, { status: 'vendido' })).toBe(false);
  });
  it('proyecto activo: un texto acotado', () => {
    expect(ok(activeProjectSchema, { projectId: '8c9a3c1e-0b1f-4a52-9d8e-2f6f5b7a1c11' })).toBe(true);
    for (const v of [{}, { projectId: '' }, { projectId: 5 }, { projectId: {} }, { projectId: 'x'.repeat(201) }]) expect(ok(activeProjectSchema, v)).toBe(false);
  });
  it('alta de proyecto: textos acotados', () => {
    expect(ok(projectCreateSchema, { name: 'Torre', projectType: 'edificio', saleMode: 'venta' })).toBe(true);
    expect(ok(projectCreateSchema, { name: { x: 1 } })).toBe(false);
    expect(ok(projectCreateSchema, { name: 'x'.repeat(501) })).toBe(false);
  });
});

describe('colaboradores', () => {
  it('invitar: handle y aporte acotados', () => {
    expect(ok(collaboratorInviteSchema, { handle: 'ana', contribution: 'Estructuras' })).toBe(true);
    expect(ok(collaboratorInviteSchema, { handle: { $ne: null } })).toBe(false);
    expect(ok(collaboratorInviteSchema, { handle: 'ana', contribution: 'x'.repeat(1001) })).toBe(false);
  });
  it('editar el aporte', () => {
    expect(ok(collaboratorPatchSchema, { contribution: 'Nuevo texto' })).toBe(true);
    expect(ok(collaboratorPatchSchema, { contribution: 5 })).toBe(false);
  });
  it('responder: solo accepted o declined', () => {
    expect(ok(collaboratorRespondSchema, { status: 'accepted' })).toBe(true);
    expect(ok(collaboratorRespondSchema, { status: 'declined' })).toBe(true);
    expect(ok(collaboratorRespondSchema, { status: 'pending' })).toBe(false);
  });
});
