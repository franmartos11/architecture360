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
  id: 'p1', slug: 'torre-sol', name: 'Torre Sol', description: '', location: 'Córdoba', masterplanImage: '', locales: ['es'],
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
      .toEqual({ label: '+54 9 11 2233-4455', href: 'https://wa.me/5491122334455' });
    expect(buildFichaContent(input()).whatsapp).toBeNull();
  });

  it('acento del tema, o gris oscuro si es muy claro', () => {
    expect(buildFichaContent(input()).accent).toBe('#8a2f42');
    expect(buildFichaContent(input({ project: project({ themeConfig: { presetKey: 'editorial', customColors: { accent: '#f5f5f5' } } }) })).accent).toBe('#1c1a17');
  });

  it('resuelve paleta completa y radio del tema (nocturno y brutalista)', () => {
    const nocturno = buildFichaContent(input({ project: project({ themeConfig: { presetKey: 'nocturno' } }) }));
    expect(nocturno.theme.bg).toBe('#121214');
    expect(nocturno.theme.surface).toBe('#1c1c20');
    expect(nocturno.theme.text).toBe('#f2f2f2');
    expect(nocturno.theme.accent).toBe('#22d3ee');
    expect(nocturno.theme.radius).toBe(10);

    const brutal = buildFichaContent(input({ project: project({ themeConfig: { presetKey: 'brutalista', customColors: { bgAlt: '#1a1a1a' } } }) }));
    expect(brutal.theme.bg).toBe('#ffffff');
    expect(brutal.theme.bgAlt).toBe('#1a1a1a');
    expect(brutal.theme.accent).toBe('#c1440e');
    expect(brutal.theme.radius).toBe(0);
    expect(brutal.theme.radiusSm).toBe(0);
  });

  it('imágenes por prioridad', () => {
    const c = buildFichaContent(input({ unit: unit({ galleryImages: ['g1', 'g2'], floorPlan3dUrl: 'f3d', plan3dUrl: 'p3d', roomPlanImage: 'rp' }) }));
    expect(c.imageUrls).toEqual({
      hero: 'g1',
      plan: 'p3d',
      gallery: [{ url: 'g2', caption: null }, { url: 'f3d', caption: 'Planta 3D' }],
      extraPlans: [],
    });
    const d = buildFichaContent(input({ unit: unit({ interiorImageUrl: 'int', galleryImages: ['g1'], technicalPlanUrl: 'tp', plan3dUrl: 'p3d' }) }));
    expect(d.imageUrls).toEqual({
      hero: 'int',
      plan: 'tp',
      gallery: [{ url: 'g1', caption: null }],
      extraPlans: [],
    });
    expect(buildFichaContent(input()).imageUrls).toEqual({ hero: null, plan: null, gallery: [], extraPlans: [] });
  });

  it('todo el texto sale apto para Helvetica (WinAnsi); las URLs no se tocan', () => {
    const c = buildFichaContent(input({
      project: project({ name: 'Torre Sol ☀️', location: 'Córdoba → Nueva Córdoba', whatsappNumber: '5491122334455' }),
      unit: unit({ name: 'A‑01 🏠', modelName: 'DUET ≈ 106', orientation: 'NE ⬈' }),
      plans: [{ ...PLAN, name: 'Plan “36” ✨', note: 'Anticipo ≤ 30% 💰' }],
      ref: 'inmo-sur',
    }));
    expect(c.projectName).toBe('Torre Sol');
    expect(c.location).toBe('Córdoba -> Nueva Córdoba');
    expect(c.unitName).toBe('A-01');
    expect(c.subtitle).toBe('DUET ~ 106');
    expect(c.specs).toContain('Orientación NE');
    expect(c.plans[0].name).toBe('Plan “36”');
    expect(c.plans[0].note).toBe('Anticipo <= 30%');
    expect(c.qrUrl).toBe(`${UNIT_URL}?ref=inmo-sur`);
    expect(c.whatsapp?.href).toBe('https://wa.me/5491122334455');
  });

  it('borrador y fecha de generación', () => {
    const c = buildFichaContent(input({ isDraft: true }));
    expect(c.draft).toBe(true);
    expect(c.generatedOn).toBe('24/11/2026');
  });
});

describe('datos ampliados del sistema', () => {
  it('avance de obra, comodidades, ambientes, amenities, entorno y mapa', () => {
    const p = project({
      tagline: 'Viví frente al parque',
      latitude: -31.4201,
      longitude: -64.1888,
      constructionProgress: {
        stages: [{ id: 's1', label: 'Estructura' }],
        currentStageId: 's1',
        percent: 45,
        deliveryEstimate: 'Diciembre 2027',
        updates: [],
      },
      amenities: [
        { id: 'a1', name: 'Pileta', images: [] },
        { id: 'a2', name: 'SUM Torre A', buildingId: 'b1', images: [] },
        { id: 'a3', name: 'Gym Torre B', buildingId: 'b2', images: [] },
      ],
      pointsOfInterest: [
        { id: 'p1', name: 'Parque Sarmiento', category: 'entretenimiento', walkMinutes: 5 },
        { id: 'p2', name: 'Sanatorio Allende', category: 'salud', distanceLabel: '3 cuadras' },
      ],
    });
    const u = unit({
      features: ['Losa radiante', 'Apto crédito'],
      rooms: [{ id: 'r1', name: 'Living comedor', area: 28, features: ['Balcón'] }],
      levels: [{ id: 'l1', label: 'Planta Alta', planImage: 'https://x.supabase.co/pa.jpg', rooms: [{ id: 'r2', name: 'Suite', area: 18 }] }],
      parkingSpots: [{ floorId: 'sub1', label: 'C-12', floorLabel: 'Subsuelo 1', polygon: [] }],
    });
    const c = buildFichaContent(input({ project: p, unit: u }));
    expect(c.projectSummary).toBe('Viví frente al parque');
    expect(c.progress).toBe('45% de avance · Estructura · Entrega estimada diciembre 2027');
    expect(c.features).toEqual(['Losa radiante', 'Apto crédito']);
    expect(c.rooms).toEqual([
      { name: 'Living comedor', area: '28 m²', features: 'Balcón' },
      { name: 'Planta Alta · Suite', area: '18 m²', features: null },
    ]);
    expect(c.amenities).toEqual(['Pileta', 'SUM Torre A']);
    expect(c.nearby).toEqual(['Parque Sarmiento (5 min a pie)', 'Sanatorio Allende (3 cuadras)']);
    expect(c.mapUrl).toBe('https://maps.google.com/?q=-31.4201,-64.1888');
    expect(c.specs).toContain('Cochera asignada: C-12 (Subsuelo 1)');
    expect(c.imageUrls.extraPlans).toEqual([{ url: 'https://x.supabase.co/pa.jpg', label: 'Planta Alta' }]);
  });

  it('galería incluye vista desde el piso según orientación y respeta tope de 3', () => {
    const b = {
      id: 'b1',
      name: 'Torre A',
      totalFloors: 5,
      coverImage: 'https://x.supabase.co/cover.jpg',
      floors: [
        {
          id: 'f3',
          number: 3,
          label: 'Piso 3',
          planImage: '',
          unitDots: [],
          viewPhotos: [
            { direction: 'N' as const, url: 'https://x.supabase.co/vn.jpg' },
            { direction: 'NE' as const, url: 'https://x.supabase.co/vne.jpg' },
          ],
        },
      ],
    };
    const u = unit({
      orientation: 'NE',
      interiorImageUrl: 'https://x.supabase.co/hero.jpg',
      galleryImages: ['https://x.supabase.co/g1.jpg', 'https://x.supabase.co/g2.jpg'],
    });
    const c = buildFichaContent(input({ building: b, unit: u }));
    expect(c.imageUrls.gallery).toEqual([
      { url: 'https://x.supabase.co/vne.jpg', caption: 'Vista desde Piso 3 (NE)' },
      { url: 'https://x.supabase.co/g1.jpg', caption: null },
      { url: 'https://x.supabase.co/g2.jpg', caption: null },
    ]);
  });

  it('showcase incluye descripción y ficha académica/créditos; venta no', () => {
    const baseShowcase = project({
      saleMode: 'showcase',
      description: 'Proyecto experimental de vivienda colectiva.',
      academicInstitution: 'FAUD UNC',
      academicYear: '2026',
      collaborators: [{ handle: 'ana', displayName: 'Ana Gómez', contribution: 'Renders' }],
    });
    const s = buildFichaContent(input({ project: baseShowcase }));
    expect(s.projectSummary).toBe('Proyecto experimental de vivienda colectiva.');
    expect(s.academic).toEqual([
      { label: 'Institución', value: 'FAUD UNC' },
      { label: 'Año', value: '2026' },
      { label: 'Créditos', value: 'Ana Gómez (Renders)' },
    ]);

    const v = buildFichaContent(input({ project: { ...baseShowcase, saleMode: 'venta' } }));
    expect(v.projectSummary).toBeNull();
    expect(v.academic).toEqual([]);
  });
});
