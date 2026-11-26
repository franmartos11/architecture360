import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import type { BimModel, Building, Project, Unit } from '@/types';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/i18n/server', () => ({ getLocale: async () => 'es' }));
vi.mock('@/components/unit/UnitViewerWrapper', () => ({ default: () => null }));
vi.mock('@/data/project-repository', () => ({ getSiteProjectBySlug: vi.fn() }));
vi.mock('@/lib/project-canonical', () => ({ projectCanonical: vi.fn(async (_slug: string, path: string) => `https://x.test${path}`) }));
vi.mock('@/lib/project-base-path', () => ({ getProjectBasePath: vi.fn(async () => '/proyecto/torres') }));
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }) }));

import { getSiteProjectBySlug } from '@/data/project-repository';
import UnitPage, { generateMetadata } from './page';

const unit = (over: Partial<Unit>): Unit => ({
  id: '101', dbId: 'u', name: '101', buildingId: 'b', floorId: 'f', floor: 1, type: '2amb' as Unit['type'],
  totalArea: 50, innerArea: 45, balconyArea: 0, externalArea: 0, bedrooms: 1, bathrooms: 1, hasServiceRoom: false,
  status: 'available', ...over,
} as Unit);

// Dos torres con la misma numeración (el código solo es único por piso).
const project = {
  id: 'p', slug: 'torres', name: 'Torres', projectType: 'edificio', saleMode: 'venta',
  buildings: [
    { id: 'b-norte', name: 'Torre Norte', floors: [] },
    { id: 'b-sur', name: 'Torre Sur', floors: [] },
  ] as unknown as Building[],
  units: [
    unit({ id: '101', dbId: 'u-norte-101', buildingId: 'b-norte', floorId: 'f-n1', totalArea: 50 }),
    unit({ id: '101', dbId: 'u-sur-101', buildingId: 'b-sur', floorId: 'f-s1', totalArea: 80 }),
  ],
  bimModels: [
    { id: 'bim-norte', unitIds: ['u-norte-101'], floorIds: [] },
    { id: 'bim-sur', unitIds: ['u-sur-101'], floorIds: [] },
  ] as unknown as BimModel[],
  amenities: [], pointsOfInterest: [], location: '',
} as unknown as Project;

const props = (buildingId: string, unitId: string) => ({
  params: Promise.resolve({ slug: 'torres', buildingId, unitId }),
  searchParams: Promise.resolve({}),
});

describe('página pública de la unidad', () => {
  beforeEach(() => {
    vi.mocked(getSiteProjectBySlug).mockResolvedValue(project);
  });

  it('con el mismo código en dos torres, muestra la unidad de la torre de la URL', async () => {
    const el = (await UnitPage(props('b-sur', '101'))) as ReactElement<{ unit: Unit; buildingName: string; bimModel?: BimModel }>;
    expect(el.props.unit.dbId).toBe('u-sur-101');
    expect(el.props.buildingName).toBe('Torre Sur');
  });

  it('la pieza BIM asignada a la unidad se encuentra por su uuid', async () => {
    const el = (await UnitPage(props('b-sur', '101'))) as ReactElement<{ bimModel?: BimModel }>;
    expect(el.props.bimModel?.id).toBe('bim-sur');
  });

  it('un código que no está en esa torre da 404 aunque exista en otra', async () => {
    const solo = { ...project, units: [project.units[0]] } as Project;
    vi.mocked(getSiteProjectBySlug).mockResolvedValue(solo);
    await expect(UnitPage(props('b-sur', '101'))).rejects.toThrow('NEXT_NOT_FOUND');
    expect((await generateMetadata(props('b-sur', '101'))).title).toBe('Unidad no encontrada');
  });

  it('la metadata describe la unidad de la torre de la URL', async () => {
    const meta = await generateMetadata(props('b-sur', '101'));
    expect(meta.description).toContain('80m²');
  });

  it('entrando por el uuid (links del bot), la canónica usa el código', async () => {
    const uuid = '3f2a9c1e-5b7d-4e8f-9a0b-1c2d3e4f5a6b';
    const p = { ...project, units: [...project.units, unit({ id: 'PB A', dbId: uuid, buildingId: 'b-sur', floorId: 'f-s0' })] } as Project;
    vi.mocked(getSiteProjectBySlug).mockResolvedValue(p);
    const meta = await generateMetadata(props('b-sur', uuid));
    expect(meta.alternates?.canonical).toBe('https://x.test/edificio/b-sur/unidad/PB%20A');
  });
});
