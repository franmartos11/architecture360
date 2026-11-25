import { describe, it, expect } from 'vitest';
import { fichaHeaderLayout, estimateLines, textWidth, HEADER_WIDTH } from './header';

describe('textWidth / estimateLines (Helvetica-Bold)', () => {
  it('mide con los anchos reales de la fuente', () => {
    expect(textWidth('MMMM', 10)).toBeCloseTo(4 * 8.33, 1);
    expect(textWidth('iiii', 10)).toBeCloseTo(4 * 2.78, 1);
    // las tildes miden como la letra base
    expect(textWidth('Córdoba', 10)).toBeCloseTo(textWidth('Cordoba', 10), 5);
  });

  it('corta por palabras', () => {
    expect(estimateLines('Torre Sol', 20, 300)).toBe(1);
    expect(estimateLines('Torre Sol Torre Sol Torre Sol Torre Sol', 20, 200)).toBeGreaterThan(1);
  });
});

describe('fichaHeaderLayout', () => {
  it('dos renglones a 20 pt todavía entran sin achicar', () => {
    const name = 'Complejo Residencial Torres del Parque Sarmiento Etapa II';
    expect(fichaHeaderLayout({ projectName: name, unitName: 'N01-07', statusLabel: 'Disponible' }).project).toEqual({ text: name, fontSize: 20 });
  });

  it('un nombre corto queda como siempre: 20 pt, sin tocar', () => {
    const h = fichaHeaderLayout({ projectName: 'Torre Sol', unitName: 'N01-07', statusLabel: 'Disponible' });
    expect(h.project).toEqual({ text: 'Torre Sol', fontSize: 20 });
    expect(h.unit).toEqual({ text: 'N01-07', fontSize: 16 });
  });

  it('un nombre largo achica la letra hasta entrar en 2 renglones', () => {
    const name = 'Complejo Residencial Torres del Parque Sarmiento Etapa II — Edificio Norte y Amenities';
    const h = fichaHeaderLayout({ projectName: name, unitName: 'N01-07', statusLabel: 'Disponible' });
    expect(estimateLines(name, 20, h.leftWidth)).toBeGreaterThan(2);
    expect(h.project.text).toBe(name);
    expect(h.project.fontSize).toBeLessThan(20);
    expect(estimateLines(name, h.project.fontSize, h.leftWidth)).toBeLessThanOrEqual(2);
  });

  it('uno larguísimo se corta con "…" en una palabra, a la letra más chica', () => {
    const name = 'Complejo Residencial Torres del Parque Sarmiento Etapa II — Edificio Norte y Amenities Premium Nueva Córdoba Barrio Jardín Espinosa';
    const h = fichaHeaderLayout({ projectName: name, unitName: 'N01-07', statusLabel: 'Disponible' });
    expect(h.project.fontSize).toBe(14);
    expect(h.project.text.endsWith('…')).toBe(true);
    expect(name.startsWith(h.project.text.slice(0, -1).trimEnd())).toBe(true);
    expect(estimateLines(h.project.text, 14, h.leftWidth)).toBeLessThanOrEqual(2);
  });

  it('la columna de la unidad no le come el lugar al proyecto', () => {
    // Proyecto de una sola unidad: la unidad se llama como el proyecto.
    const name = 'Casa de campo con pileta y quincho en Villa Allende Golf';
    const h = fichaHeaderLayout({ projectName: name, unitName: name, statusLabel: 'Disponible' });
    expect(h.rightWidth).toBeLessThanOrEqual(HEADER_WIDTH * 0.4);
    expect(h.leftWidth).toBeGreaterThanOrEqual(HEADER_WIDTH * 0.55);
    expect(estimateLines(h.unit.text, h.unit.fontSize, h.rightWidth)).toBeLessThanOrEqual(2);
  });

  it('la columna de la unidad mide al menos lo que el estado', () => {
    const h = fichaHeaderLayout({ projectName: 'Torre Sol', unitName: 'A1', statusLabel: 'No disponible' });
    expect(h.rightWidth).toBeGreaterThanOrEqual(textWidth('NO DISPONIBLE', 8.5));
  });
});
