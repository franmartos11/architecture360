import { describe, it, expect } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import sharp from 'sharp';
import { renderToBuffer } from '@react-pdf/renderer';
import { getProjectTypeConfig } from '@/lib/project-types';
import { newPlan } from '@/lib/financing';
import type { Project, Unit } from '@/types';
import { buildFichaContent } from './content';
import { qrPng } from './qr';
import { FichaDocument } from './FichaDocument';

const project = { id: 'p', slug: 'x', name: 'Torre Sol', location: 'Nueva Córdoba, Córdoba', projectType: 'edificio', saleMode: 'venta', themeConfig: { presetKey: 'editorial' }, whatsappNumber: '5493514556677' } as unknown as Project;
const unit = {
  id: 'N01-07', dbId: 'x', name: 'N01-07', modelName: 'DUET 106 JARDIN', buildingId: 'b', floorId: 'f', floor: 1, type: '2amb',
  totalArea: 106, innerArea: 90, balconyArea: 12, externalArea: 16, bedrooms: 2, bathrooms: 1, hasServiceRoom: true,
  price: 145000, currency: 'USD', status: 'available', orientation: 'NE', garageSpaces: 1, ceilingHeight: 2.7,
} as unknown as Unit;
const plans = [
  { ...newPlan(), id: 'a', name: 'Plan 36 cuotas' },
  { ...newPlan(), id: 'b', name: 'Contado', downPaymentPct: 100, installments: 0, installmentsPct: 0, boosts: 0, boostsPct: 0, priceAdjustmentPct: -10, index: 'ninguno' as const },
  { ...newPlan(), id: 'c', name: 'Plan 60 cuotas', installments: 60 },
];
const UNIT_URL = 'https://torre-sol.atrium.app/edificio/torre-b/unidad/N01-07';

function content(p: Project = project) {
  return buildFichaContent({ project: p, unit, buildingName: 'Torre A', typeConfig: getProjectTypeConfig('edificio', 'venta'), plans, unitUrl: UNIT_URL, ref: 'inmo-sur', isDraft: false, now: new Date('2026-11-24T15:00:00Z') });
}

function findAll(node: ReactNode, pred: (el: ReactElement<Record<string, unknown>>) => boolean, out: ReactElement<Record<string, unknown>>[] = []) {
  if (Array.isArray(node)) node.forEach(n => findAll(n, pred, out));
  else if (isValidElement<Record<string, unknown>>(node)) {
    if (pred(node)) out.push(node);
    findAll(node.props.children as ReactNode, pred, out);
  }
  return out;
}

describe('FichaDocument', () => {
  it('una unidad típica (9 datos, render, plano y 3 planes) entra en una hoja', async () => {
    const img = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#88a' } }).jpeg().toBuffer();
    const c = content();
    expect(c.specs.length).toBeGreaterThanOrEqual(9);
    const buf = await renderToBuffer(<FichaDocument content={c} images={{ hero: img, plan: img }} qr={await qrPng(c.qrUrl)} />);
    const pages = buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [];
    expect(pages).toHaveLength(1);
  });

  it('con un nombre de proyecto muy largo la unidad típica sigue entrando en una hoja', async () => {
    const img = await sharp({ create: { width: 1600, height: 1000, channels: 3, background: '#88a' } }).jpeg().toBuffer();
    const long = { ...project, name: 'Complejo Residencial Torres del Parque Sarmiento Etapa II — Edificio Norte y Amenities Premium Nueva Córdoba Barrio Jardín Espinosa' } as Project;
    const c = content(long);
    const buf = await renderToBuffer(<FichaDocument content={c} images={{ hero: img, plan: img }} qr={await qrPng(c.qrUrl)} />);
    const pages = buf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [];
    expect(pages).toHaveLength(1);
  });

  it('la URL impresa no se corta con guiones', () => {
    const c = content();
    const tree = FichaDocument({ content: c, images: { hero: null, plan: null }, qr: Buffer.alloc(0) });
    const blocks = findAll(tree, el => findAll(el.props.children as ReactNode, x => x.props.src === c.qrUrl).length > 0 && !!el.props.hyphenationCallback);
    expect(blocks.length).toBeGreaterThan(0);
    const hyph = blocks[blocks.length - 1].props.hyphenationCallback as ((w: string) => string[]) | undefined;
    expect(hyph?.('edificio')).toEqual(['edificio']);
  });

  it('renderiza secciones ampliadas (comodidades, ambientes, amenities, galería y entorno)', async () => {
    const img = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#88a' } }).jpeg().toBuffer();
    const richProject = {
      ...project,
      tagline: 'Viviendas luminosas frente al parque.',
      latitude: -31.42,
      longitude: -64.18,
      constructionProgress: { stages: [{ id: 's1', label: 'Terminaciones' }], currentStageId: 's1', percent: 75, deliveryEstimate: 'Diciembre 2027', updates: [] },
      amenities: [{ id: 'a1', name: 'Pileta', images: [] }, { id: 'a2', name: 'SUM', images: [] }],
      pointsOfInterest: [{ id: 'p1', name: 'Parque Sarmiento', category: 'entretenimiento', walkMinutes: 5 }],
    } as unknown as Project;
    const richUnit = {
      ...unit,
      features: ['Losa radiante', 'Apto crédito'],
      rooms: [{ id: 'r1', name: 'Living', area: 28, features: ['Balcón'] }],
    } as unknown as Unit;
    const c = buildFichaContent({
      project: richProject,
      unit: richUnit,
      buildingName: 'Torre A',
      typeConfig: getProjectTypeConfig('edificio', 'venta'),
      plans,
      unitUrl: UNIT_URL,
      ref: null,
      isDraft: false,
      now: new Date('2026-11-24T15:00:00Z'),
    });
    const buf = await renderToBuffer(
      <FichaDocument
        content={c}
        images={{
          hero: img,
          plan: img,
          gallery: [{ data: img, caption: 'Vista desde Piso 1 (NE)' }],
          extraPlans: [{ data: img, label: 'Planta Alta' }],
        }}
        qr={await qrPng(c.qrUrl)}
      />
    );
    expect(buf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
  });
});
