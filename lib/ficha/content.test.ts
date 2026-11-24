import { describe, it, expect } from 'vitest';
import type { Project, Unit } from '@/types';
import { getProjectTypeConfig } from '@/lib/project-types';
import { formatPrice, getStatusLabel, UNIT_CATEGORY_LABEL } from '@/lib/units';
import { newPlan, type FinancingPlan } from '@/lib/financing';
import { buildFichaContent, fichaDate, fichaFileName, unitSpecLines, type FichaInput } from './content';

const NOW = new Date('2026-11-25T02:30:00Z'); // todavía 24/11 en Argentina
const UNIT_URL = 'https://torre-sol.atrium.app/edificio/b1/unidad/N01-07';

const unit = (over: Partial<Unit> = {}): Unit => ({
  id: 'N01-07', dbId: '11111111-1111-4111-8111-111111111111', name: 'N01-07', modelName: 'DUET 106',
  buildingId: 'b1', floorId: 'f3', floor: 3, type: '2amb' as Unit['type'],
  totalArea: 106, innerArea: 90, balconyArea: 0, externalArea: 16,
  bedrooms: 2, bathrooms: 1, hasServiceRoom: false,
  price: 100000, currency: 'USD', status: 'available',
  ...over,
});

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', slug: 'torre-sol', name: 'Torre Sol', description: '', location: 'Córdoba', masterplanImage: '',
  projectType: 'edificio', saleMode: 'venta', processGallery: [], beforeAfter: [], collaborators: [],
  aerialSlides: [], buildings: [], units: [], amenities: [], pointsOfInterest: [], bimModels: [],
  themeConfig: { presetKey: 'editorial' },
  ...over,
});

const PLAN: FinancingPlan = { ...newPlan(), id: 'p', name: 'Plan 36 cuotas' }; // 30 + 36 cuotas 40% + 3 refuerzos semestrales 15% + CAC

function input(over: Partial<FichaInput> = {}): FichaInput {
  const p = over.project ?? project();
  return {
    project: p,
    unit: unit(),
    buildingName: 'Torre A',
    typeConfig: getProjectTypeConfig(p.projectType, p.saleMode),
    plans: [],
    unitUrl: UNIT_URL,
    ref: null,
    isDraft: false,
    now: NOW,
    ...over,
  };
}

const usd = (n: number) => formatPrice(n, 'USD');

describe('fichaDate / fichaFileName', () => {
  it('fecha en hora de Argentina', () => {
    expect(fichaDate(NOW)).toBe('24/11/2026');
  });
  it('nombre de archivo', () => {
    expect(fichaFileName('Torre Sol', 'N01-07')).toBe('ficha-torre-sol-n01-07.pdf');
  });
});

describe('precio y planes', () => {
  it('con precio visible: "Precio al" y monto', () => {
    const c = buildFichaContent(input({ unit: unit({ price: 145000 }) }));
    expect(c.price).toEqual({ label: 'Precio al 24/11/2026', amount: usd(145000) });
    expect(c.askPrice).toBe(false);
  });

  it('proyecto solo para mostrar: sin precio ni planes', () => {
    const p = project({ saleMode: 'showcase' });
    const c = buildFichaContent(input({ project: p, plans: [PLAN] }));
    expect(c.price).toBeNull();
    expect(c.plans).toEqual([]);
    expect(c.plansNote).toBeNull();
  });

  it('sin precio: consultar, sin planes', () => {
    const c = buildFichaContent(input({ unit: unit({ price: undefined }), plans: [PLAN] }));
    expect(c.price).toBeNull();
    expect(c.askPrice).toBe(true);
    expect(c.plans).toEqual([]);
  });

  it('desglose del plan sobre el precio de la unidad', () => {
    const c = buildFichaContent(input({ plans: [PLAN] }));
    expect(c.plans).toHaveLength(1);
    const row = c.plans[0];
    expect(row.name).toBe('Plan 36 cuotas');
    expect(row.planPrice).toBeNull();
    expect(row.lines).toEqual([
      `Anticipo ${usd(30000)}`,
      `36 cuotas de ${usd(1111)}`,
      `3 refuerzos semestrales de ${usd(5000)}`,
      `Saldo a la posesión ${usd(15000)}`,
    ]);
    expect(row.indexNote).toBe('Cuotas ajustables por CAC');
    expect(c.plansNote).toBe('Montos calculados al 24/11/2026. Las cuotas se ajustan según el índice indicado.');
  });

  it('plan con descuento muestra el precio del plan', () => {
    const c = buildFichaContent(input({ plans: [{ ...PLAN, priceAdjustmentPct: -10 }] }));
    expect(c.plans[0].planPrice).toBe(usd(90000));
  });

  it('plan de contado (100% de anticipo): "Pago contado"', () => {
    const contado = { ...PLAN, downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, index: 'ninguno' as const };
    expect(buildFichaContent(input({ plans: [contado] })).plans[0].lines).toEqual([`Pago contado ${usd(100000)}`]);
  });

  it('plan sin índice ni nota', () => {
    const c = buildFichaContent(input({ plans: [{ ...PLAN, index: 'ninguno' }] }));
    expect(c.plans[0].indexNote).toBeNull();
    expect(c.plans[0].note).toBeNull();
  });

  it('lote: planes solo si hay planes cargados', () => {
    const p = project({ projectType: 'loteo' });
    expect(buildFichaContent(input({ project: p, plans: [PLAN] })).plans).toHaveLength(1);
    expect(buildFichaContent(input({ project: p, plans: [] })).plans).toEqual([]);
  });
});

describe('estado y subtítulo', () => {
  it('estado según el sitio', () => {
    expect(buildFichaContent(input({ unit: unit({ status: 'sold' }) })).status?.label).toBe(getStatusLabel('sold'));
    expect(buildFichaContent(input({ project: project({ saleMode: 'showcase' }) })).status).toBeNull();
  });

  it('subtítulo: modelo, categoría o nada en lotes', () => {
    expect(buildFichaContent(input()).subtitle).toBe('DUET 106');
    expect(buildFichaContent(input({ unit: unit({ category: 'comercial' }) })).subtitle).toBe(UNIT_CATEGORY_LABEL.comercial);
    expect(buildFichaContent(input({ project: project({ projectType: 'loteo' }) })).subtitle).toBeNull();
  });
});

describe('unitSpecLines', () => {
  const base = { unitIsLand: false, hasUnitStep: true, hasFloorStep: true, buildingName: 'Torre A' };

  it('departamento', () => {
    const lines = unitSpecLines(unit({ orientation: 'NE' }), base);
    expect(lines[0]).toBe('Piso 3 · Torre A');
    expect(lines).toContain('Área total 106 m²');
    expect(lines).toContain('2 Dormitorios');
    expect(lines).toContain('Orientación NE');
    expect(lines.some(l => l.includes('balcones'))).toBe(false);
    expect(lines).toContain('1 Baño');
    expect(unitSpecLines(unit({ bathrooms: 2.5 }), base)).toContain('2.5 Baños');
  });

  it('lote', () => {
    const lines = unitSpecLines(unit({ totalArea: 300 }), { ...base, unitIsLand: true, hasFloorStep: false });
    expect(lines[0]).toBe('Superficie 300 m²');
    expect(lines.some(l => l.startsWith('Área interna'))).toBe(false);
  });
});

describe('QR, contacto, acento, imágenes, borrador', () => {
  it('QR con ref normalizado', () => {
    expect(buildFichaContent(input({ ref: 'Inmo Sur!' })).qrUrl).toBe(`${UNIT_URL}?ref=inmo-sur`);
    expect(buildFichaContent(input({ ref: '' })).qrUrl).toBe(UNIT_URL);
    expect(buildFichaContent(input({ ref: null })).qrUrl).toBe(UNIT_URL);
    const long = buildFichaContent(input({ ref: 'a'.repeat(200) })).qrUrl;
    expect(long.length).toBeLessThanOrEqual(UNIT_URL.length + '?ref='.length + 60);
  });

  it('texto del QR: no promete lo que la unidad no tiene', () => {
    const tour = { tourImageUrl: 'https://abc.supabase.co/p.jpg' };
    expect(buildFichaContent(input({ unit: unit(tour) })).qrLead).toBe('Escaneá para ver la unidad en 3D, el recorrido 360° y el precio actualizado');
    expect(buildFichaContent(input({ unit: unit({ ...tour, price: undefined }) })).qrLead).toBe('Escaneá para ver la unidad en 3D, el recorrido 360° y el precio actualizado');
    expect(buildFichaContent(input({ unit: unit(tour), project: project({ saleMode: 'showcase' }) })).qrLead).toBe('Escaneá para ver la unidad en 3D y el recorrido 360°');
    expect(buildFichaContent(input()).qrLead).toBe('Escaneá para ver la unidad online y el precio actualizado');
    expect(buildFichaContent(input({ project: project({ saleMode: 'showcase' }) })).qrLead).toBe('Escaneá para ver la unidad online');
  });

  it('WhatsApp solo con número', () => {
    expect(buildFichaContent(input({ project: project({ whatsappNumber: '5491122334455' }) })).whatsapp)
      .toEqual({ label: '+5491122334455', href: 'https://wa.me/5491122334455' });
    expect(buildFichaContent(input()).whatsapp).toBeNull();
  });

  it('acento del tema, o gris oscuro si es muy claro', () => {
    expect(buildFichaContent(input()).accent).toBe('#8a2f42');
    expect(buildFichaContent(input({ project: project({ themeConfig: { presetKey: 'editorial', customColors: { accent: '#f5f5f5' } } }) })).accent).toBe('#1c1a17');
  });

  it('imágenes por prioridad', () => {
    const c = buildFichaContent(input({ unit: unit({ galleryImages: ['g1'], floorPlan3dUrl: 'f3d', plan3dUrl: 'p3d', roomPlanImage: 'rp' }) }));
    expect(c.imageUrls).toEqual({ hero: 'g1', plan: 'p3d' });
    const d = buildFichaContent(input({ unit: unit({ interiorImageUrl: 'int', galleryImages: ['g1'], technicalPlanUrl: 'tp', plan3dUrl: 'p3d' }) }));
    expect(d.imageUrls).toEqual({ hero: 'int', plan: 'tp' });
    expect(buildFichaContent(input()).imageUrls).toEqual({ hero: null, plan: null });
  });

  it('borrador y fecha de generación', () => {
    const c = buildFichaContent(input({ isDraft: true }));
    expect(c.draft).toBe(true);
    expect(c.generatedOn).toBe('24/11/2026');
  });
});
