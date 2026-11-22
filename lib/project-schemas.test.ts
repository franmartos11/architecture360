import { describe, it, expect } from 'vitest';
import { themeConfigSchema, sectionConfigSchema, processGallerySchema, beforeAfterSchema, commonAreasTourSchema, constructionProgressSchema } from './project-schemas';

const ok = (schema: { safeParse: (v: unknown) => { success: boolean } }, v: unknown) => schema.safeParse(v).success;

describe('themeConfigSchema', () => {
  it('acepta lo que guarda el panel (preset, tipografías, colores hex, radio, fondo)', () => {
    expect(ok(themeConfigSchema, {})).toBe(true);
    expect(ok(themeConfigSchema, {
      presetKey: 'natural', headingFont: 'playfair', bodyFont: 'custom:8c9a3c1e-0b1f-4a52-9d8e-2f6f5b7a1c11',
      customColors: { bg: '#f5f5f5', accent: '#c1440e', text: '#000' }, radius: '1.25rem',
      backgroundImageUrl: 'https://x.supabase.co/storage/v1/object/public/project-media/fondo.jpg',
    })).toBe(true);
    expect(ok(themeConfigSchema, { radius: '0px' })).toBe(true);
    expect(ok(themeConfigSchema, { radius: '0' })).toBe(true);
  });

  it.each([
    ['color que no es hex', { customColors: { bg: 'red' } }],
    ['color con url()', { customColors: { bg: 'url(https://evil.com/x.png)' } }],
    ['color con inyección de CSS', { customColors: { accent: '#fff; background: red' } }],
    ['radio con unidad inventada', { radius: '10vw' }],
    ['radio con inyección', { radius: '0px; color: red' }],
    ['fondo con comilla (rompe el url(\'…\'))', { backgroundImageUrl: "https://a.com/x.jpg');background:url('//evil" }],
    ['fondo con paréntesis', { backgroundImageUrl: 'https://a.com/x).jpg' }],
    ['fondo con espacio', { backgroundImageUrl: 'https://a.com/mi fondo.jpg' }],
    ['fondo con javascript:', { backgroundImageUrl: 'javascript:alert(1)' }],
    ['presetKey con caracteres raros', { presetKey: 'natural"><script>' }],
    ['tipografía con caracteres raros', { headingFont: "x'; } body { display:none" }],
  ])('rechaza %s', (_n, body) => {
    expect(ok(themeConfigSchema, body)).toBe(false);
  });

  it('customColors descarta claves que no son colores (resolveTheme las esparce sobre los tokens)', () => {
    const r = themeConfigSchema.parse({ customColors: { bg: '#fff', radius: '999px', spacing: 'x', evil: '1' } });
    expect(r.customColors).toEqual({ bg: '#fff' });
  });

  it('conserva claves desconocidas de nivel superior (el panel puede sumar nuevas) pero acota el tamaño', () => {
    expect(themeConfigSchema.parse({ presetKey: 'natural', futuro: 'x' })).toMatchObject({ futuro: 'x' });
    expect(ok(themeConfigSchema, { futuro: 'x'.repeat(25_000) })).toBe(false);
  });
});

describe('sectionConfigSchema', () => {
  it('acepta el orden de secciones que guarda el panel', () => {
    expect(ok(sectionConfigSchema, [{ key: 'about', enabled: true }, { key: 'amenities', enabled: false }])).toBe(true);
    expect(ok(sectionConfigSchema, [])).toBe(true);
  });
  it.each([
    ['no es un array', { key: 'about', enabled: true }],
    ['enabled como texto', [{ key: 'about', enabled: 'si' }]],
    ['sin key', [{ enabled: true }]],
    ['más de 100 secciones', Array(101).fill({ key: 'a', enabled: true })],
  ])('rechaza %s', (_n, v) => {
    expect(ok(sectionConfigSchema, v)).toBe(false);
  });
});

describe('processGallerySchema y beforeAfterSchema', () => {
  it('aceptan lo normal', () => {
    expect(ok(processGallerySchema, ['https://x.com/a.jpg', '/local/b.jpg'])).toBe(true);
    expect(ok(beforeAfterSchema, [{ label: 'Fachada', beforeImage: 'https://x.com/a.jpg', afterImage: 'https://x.com/b.jpg' }])).toBe(true);
  });
  it('rechazan javascript: y topes', () => {
    expect(ok(processGallerySchema, ['javascript:alert(1)'])).toBe(false);
    expect(ok(processGallerySchema, Array(101).fill('https://x.com/a.jpg'))).toBe(false);
    expect(ok(beforeAfterSchema, [{ label: 'x', beforeImage: 'javascript:alert(1)', afterImage: 'https://x.com/b.jpg' }])).toBe(false);
    expect(ok(beforeAfterSchema, Array(51).fill({ label: 'x', beforeImage: 'https://a.com/a.jpg', afterImage: 'https://a.com/b.jpg' }))).toBe(false);
  });
});

describe('commonAreasTourSchema', () => {
  it('acepta null (sin recorrido) y un recorrido real', () => {
    expect(ok(commonAreasTourSchema, null)).toBe(true);
    expect(ok(commonAreasTourSchema, { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Hall', imageUrl: 'https://x.com/p.jpg' }] })).toBe(true);
  });
  it('rechaza javascript: en un nodo y un tour demasiado grande', () => {
    expect(ok(commonAreasTourSchema, { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Hall', imageUrl: 'javascript:alert(1)' }] })).toBe(false);
    expect(ok(commonAreasTourSchema, { initialNodeId: 'n1', nodes: [{ id: 'n1', name: 'Hall', imageUrl: 'https://x.com/p.jpg', note: 'x'.repeat(600_000) }] })).toBe(false);
  });
});

describe('constructionProgressSchema', () => {
  it('acepta null, lo que guarda el panel y los campos nuevos (fechas de etapa, clip, borrador, inicio de obra)', () => {
    expect(ok(constructionProgressSchema, null)).toBe(true);
    expect(ok(constructionProgressSchema, { stages: [], updates: [] })).toBe(true);
    expect(ok(constructionProgressSchema, {
      stages: [{ id: 's1', label: 'Estructura', from: '2026-01-01', to: '2026-06-30' }],
      currentStageId: 's1', percent: 40, deliveryEstimate: 'Diciembre 2027', startedAt: '2025-11-01',
      updates: [{ id: 'u1', date: '2026-03-01', stageId: 's1', title: 'Losa', body: 'x', images: ['https://a.com/1.jpg'], video: 'https://a.com/clip.mp4', view: 'Dron', draft: true }],
    })).toBe(true);
  });

  it.each([
    ['sin stages', { updates: [] }],
    ['fecha de entrada que no es yyyy-mm-dd', { stages: [], updates: [{ date: '01/03/2026', title: 'x', images: [] }] }],
    ['fecha de etapa inválida', { stages: [{ label: 'x', from: 'marzo' }], updates: [] }],
    ['javascript: en una foto', { stages: [], updates: [{ date: '2026-03-01', title: 'x', images: ['javascript:alert(1)'] }] }],
    ['javascript: en el clip', { stages: [], updates: [{ date: '2026-03-01', title: 'x', images: [], video: 'javascript:alert(1)' }] }],
    ['demasiadas entradas', { stages: [], updates: Array.from({ length: 301 }, () => ({ date: '2026-03-01', title: 'x', images: [] })) }],
    ['demasiadas etapas', { stages: Array.from({ length: 51 }, () => ({ label: 'x' })), updates: [] }],
    ['draft que no es booleano', { stages: [], updates: [{ date: '2026-03-01', title: 'x', images: [], draft: 'si' }] }],
    ['demasiado grande (más de 600 KB)', { stages: [], updates: Array.from({ length: 10 }, () => ({ date: '2026-03-01', title: 'x', images: Array.from({ length: 50 }, (_, i) => `https://a.com/${'z'.repeat(1900)}${i}`) })) }],
  ])('rechaza %s', (_n, body) => {
    expect(ok(constructionProgressSchema, body)).toBe(false);
  });
});
