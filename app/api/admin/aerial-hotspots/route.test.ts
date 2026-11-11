import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/require-project-access', () => ({
  requireProjectAccess: vi.fn(),
  resolveProjectIdFromSlide: vi.fn(),
  resolveProjectIdFromBuilding: vi.fn(),
}));

import {
  requireProjectAccess,
  resolveProjectIdFromSlide,
  resolveProjectIdFromBuilding,
} from '@/lib/supabase/require-project-access';
import { mockSupabase, jsonRequest } from '@/lib/test-helpers/supabase-mock';
import { POST } from './route';

const VALID_BODY = { slideId: 'slide-1', buildingId: 'building-1', x: 0.5, y: 0.25 };

describe('POST /api/admin/aerial-hotspots', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromSlide).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it('faltan campos requeridos: 400 sin resolver nada', async () => {
    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', { slideId: 'slide-1' }));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromSlide).not.toHaveBeenCalled();
    expect(resolveProjectIdFromBuilding).not.toHaveBeenCalled();
  });

  it('x=0 e y=0 son válidos (no deben tratarse como "falta el campo")', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', { ...VALID_BODY, x: 0, y: 0 }));
    // No debe ser 400 por "faltan campos": el siguiente chequeo (401 por acceso) confirma que pasó la validación.
    expect(res.status).toBe(401);
  });

  it('vista aérea inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue(null);
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('edificio inexistente: 404', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(404);
  });

  it('vista aérea y edificio de proyectos distintos: 400', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-2');

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(400);
  });

  it('sin acceso al proyecto: 401', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    vi.mocked(requireProjectAccess).mockResolvedValue(null);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('alta válida: inserta y devuelve 201, con polygon null por defecto', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ data: { id: 'hotspot-1', x: 0.5, y: 0.25 } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 'hotspot-1', x: 0.5, y: 0.25 });
  });

  it('error de la base al insertar: 500 con el mensaje', async () => {
    vi.mocked(resolveProjectIdFromSlide).mockResolvedValue('project-1');
    vi.mocked(resolveProjectIdFromBuilding).mockResolvedValue('project-1');
    const supabase = mockSupabase({ results: [{ error: { message: 'boom' } }] });
    vi.mocked(requireProjectAccess).mockResolvedValue({ supabase, user: { id: 'user-1' } } as never);

    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', VALID_BODY));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('No se pudo completar la operación. Probá de nuevo en un rato.'); // no filtra el mensaje de la base
  });
});

describe('POST /api/admin/aerial-hotspots: validación de forma y topes', () => {
  beforeEach(() => {
    vi.mocked(requireProjectAccess).mockReset();
    vi.mocked(resolveProjectIdFromSlide).mockReset();
    vi.mocked(resolveProjectIdFromBuilding).mockReset();
  });

  it.each([
    ['x como texto', { slideId: 's1', buildingId: 'b1', x: '10', y: 20 }],
    ['coordenada absurda', { slideId: 's1', buildingId: 'b1', x: 1e12, y: 20 }],
    ['polígono con más de 500 puntos', { slideId: 's1', buildingId: 'b1', x: 1, y: 2, polygon: Array(501).fill({ x: 1, y: 1 }) }],
    ['polígono con puntos mal formados', { slideId: 's1', buildingId: 'b1', x: 1, y: 2, polygon: [[0, 0]] }],
  ])('400 con %s, antes de resolver nada', async (_n, body) => {
    const res = await POST(jsonRequest('http://localhost/api/admin/aerial-hotspots', body));
    expect(res.status).toBe(400);
    expect(resolveProjectIdFromSlide).not.toHaveBeenCalled();
  });
});
