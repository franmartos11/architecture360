import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/data/project-repository', () => ({ getSiteProject: vi.fn() }));
vi.mock('@/lib/ficha/images', () => ({ loadPdfImage: vi.fn() }));
vi.mock('@/lib/financing-server', () => ({ readFinancingPlans: vi.fn() }));
vi.mock('@/lib/project-canonical', () => ({ projectCanonical: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({})) }));
vi.mock('@/lib/rate-limit', () => ({ rateLimitOrRespond: vi.fn() }));
vi.mock('@/lib/request-ip', () => ({ clientIp: vi.fn(() => '1.2.3.4') }));

import { getSiteProject } from '@/data/project-repository';
import { loadPdfImage } from '@/lib/ficha/images';
import { readFinancingPlans } from '@/lib/financing-server';
import { projectCanonical } from '@/lib/project-canonical';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';
import { newPlan } from '@/lib/financing';
import type { Project, Unit } from '@/types';
import { GET } from './route';

const UNIT_ID = '11111111-1111-4111-8111-111111111111';

const unit: Unit = {
  id: 'N01-07', dbId: UNIT_ID, name: 'N01-07', modelName: 'DUET 106', buildingId: 'b1', floorId: 'f3', floor: 3,
  type: '2amb' as Unit['type'], totalArea: 106, innerArea: 90, balconyArea: 0, externalArea: 16,
  bedrooms: 2, bathrooms: 1, hasServiceRoom: false, price: 100000, currency: 'USD', status: 'available',
  interiorImageUrl: 'https://abc.supabase.co/a.webp', technicalPlanUrl: 'https://abc.supabase.co/p.svg',
};

const project = {
  id: 'p1', slug: 'torre-sol', name: 'Torre Sol', description: '', location: 'Córdoba', masterplanImage: '',
  projectType: 'edificio', saleMode: 'venta', processGallery: [], beforeAfter: [], collaborators: [], aerialSlides: [],
  buildings: [{ id: 'b1', name: 'Torre A', floors: [], totalFloors: 10 }],
  units: [unit], amenities: [], pointsOfInterest: [], bimModels: [],
} as unknown as Project;

const call = (unitId: string, qs = '') =>
  GET(new Request(`http://localhost/api/ficha/torre-sol/${unitId}${qs}`), { params: Promise.resolve({ slug: 'torre-sol', unitId }) });

const bodyStart = async (res: Response) => Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString('latin1');

describe('GET /api/ficha/[slug]/[unitId]', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.mocked(getSiteProject).mockReset().mockResolvedValue({ project, isDraftPreview: false, canPublish: false });
    vi.mocked(loadPdfImage).mockReset().mockResolvedValue(null);
    vi.mocked(readFinancingPlans).mockReset().mockResolvedValue([]);
    vi.mocked(projectCanonical).mockReset().mockResolvedValue('https://torre.atrium.app/edificio/b1/unidad/N01-07');
    vi.mocked(rateLimitOrRespond).mockReset().mockResolvedValue(null);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('límite por IP: 429 sin armar nada', async () => {
    vi.mocked(rateLimitOrRespond).mockResolvedValue(NextResponse.json({ error: 'x' }, { status: 429 }));
    const res = await call(UNIT_ID);
    expect(res.status).toBe(429);
    expect(getSiteProject).not.toHaveBeenCalled();
    expect(rateLimitOrRespond).toHaveBeenCalledWith(expect.objectContaining({ key: 'ficha:ip:1.2.3.4' }), expect.any(String));
  });
  afterEach(() => errorSpy.mockRestore());

  it('código en vez de uuid: 404 sin cargar el proyecto', async () => {
    const res = await call('N01-07');
    expect(res.status).toBe(404);
    expect(getSiteProject).not.toHaveBeenCalled();
  });

  it('proyecto inexistente o borrador ajeno: 404', async () => {
    vi.mocked(getSiteProject).mockResolvedValue(undefined);
    expect((await call(UNIT_ID)).status).toBe(404);
  });

  it('uuid que no es de una unidad del proyecto: 404', async () => {
    expect((await call('22222222-2222-4222-8222-222222222222')).status).toBe(404);
  });

  it('arma el PDF', async () => {
    const res = await call(UNIT_ID, '?ref=inmo-sur');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toBe('inline; filename="ficha-torre-sol-n01-07.pdf"');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(await bodyStart(res)).toBe('%PDF');
    expect(projectCanonical).toHaveBeenCalledWith('torre-sol', '/edificio/b1/unidad/N01-07');
    expect(readFinancingPlans).toHaveBeenCalledWith(expect.anything(), 'p1');
    expect(loadPdfImage).toHaveBeenCalledWith('https://abc.supabase.co/a.webp', fetch, expect.stringMatching(/^https?:\/\//));
    expect(loadPdfImage).toHaveBeenCalledWith('https://abc.supabase.co/p.svg', fetch, expect.stringMatching(/^https?:\/\//));
  });

  it('codifica el código de la unidad en la URL del QR', async () => {
    const odd = { ...unit, id: 'PB 1/A' };
    vi.mocked(getSiteProject).mockResolvedValue({ project: { ...project, units: [odd] }, isDraftPreview: false, canPublish: false });
    await call(UNIT_ID);
    expect(projectCanonical).toHaveBeenCalledWith('torre-sol', `/edificio/b1/unidad/${encodeURIComponent('PB 1/A')}`);
  });

  it('con una imagen real (JPEG) y 6 planes de nombre largo sale igual', async () => {
    const sharp = (await import('sharp')).default;
    const jpg = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#88a' } }).jpeg().toBuffer();
    vi.mocked(loadPdfImage).mockResolvedValue(jpg);
    vi.mocked(readFinancingPlans).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({ ...newPlan(), id: `p${i}`, name: `${'Plan largo '.repeat(5)}${i}`.slice(0, 60), note: 'Cuotas en pesos al tipo de cambio del día.' })),
    );
    const res = await call(UNIT_ID);
    expect(res.status).toBe(200);
    expect(await bodyStart(res)).toBe('%PDF');
  });

  it('borrador: sale con la franja de vista previa', async () => {
    vi.mocked(getSiteProject).mockResolvedValue({ project, isDraftPreview: true, canPublish: false });
    const res = await call(UNIT_ID);
    expect(res.status).toBe(200);
  });

  it('error al armar: 500 y log', async () => {
    vi.mocked(readFinancingPlans).mockRejectedValue(new Error('boom'));
    const res = await call(UNIT_ID);
    expect(res.status).toBe(500);
    expect(errorSpy.mock.calls.some((c: unknown[]) => String(c[0]).startsWith('[ficha]'))).toBe(true);
  });
});
