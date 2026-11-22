import { describe, it, expect } from 'vitest';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';
import { visibleUpdates } from './construction-progress';
import {
  lapseAngles, lapseFrames, frameHasAngle, progressHeadline, sameAngleComparison,
  showsConstructionProgress, storyWindow, updateIdFromHash,
} from './construction-progress-view';

const up = (id: string, date: string, extra: Partial<ConstructionUpdate> = {}): ConstructionUpdate => ({
  id, date, title: id, images: [`/${id}.jpg`], ...extra,
});

const base = (updates: ConstructionUpdate[], extra: Partial<ConstructionProgress> = {}): ConstructionProgress => ({
  stages: [{ id: 's0', label: 'Estructura' }, { id: 's1', label: 'Terminaciones' }],
  updates,
  ...extra,
});

describe('lapseFrames', () => {
  it('el clip va primero, con la primera foto de poster; una entrada solo-clip no tiene imagen', () => {
    const frames = lapseFrames([
      up('a', '2026-01-01', { video: '/a.mp4', images: ['/a1.jpg', '/a2.jpg'] }),
      up('b', '2026-02-01', { video: '/b.mp4', images: [] }),
    ]);
    expect(frames.map(f => [f.key, f.video ?? null, f.image ?? null])).toEqual([
      ['a-v', '/a.mp4', '/a1.jpg'],
      ['a-0', null, '/a1.jpg'],
      ['a-1', null, '/a2.jpg'],
      ['b-v', '/b.mp4', null],
    ]);
  });
});

describe('lapseAngles', () => {
  it('chips solo con dos o más ángulos de dos o más cuadros, sin distinguir mayúsculas', () => {
    const frames = lapseFrames([
      up('a', '2026-01-01', { view: 'Frente' }),
      up('b', '2026-02-01', { view: 'frente ' }),
      up('c', '2026-03-01', { view: 'Dron', images: ['/c1.jpg', '/c2.jpg', '/c3.jpg'] }),
      up('d', '2026-04-01', { view: 'Interior' }),
    ]);
    expect(lapseAngles(frames)).toEqual(['Dron', 'Frente']);
    expect(frames.filter(f => frameHasAngle(f, 'Frente')).map(f => f.update.id)).toEqual(['a', 'b']);
  });

  it('un solo ángulo con varios cuadros no alcanza', () => {
    const frames = lapseFrames([up('a', '2026-01-01', { view: 'Frente' }), up('b', '2026-02-01', { view: 'Frente' }), up('c', '2026-03-01', { view: 'Dron' })]);
    expect(lapseAngles(frames)).toEqual([]);
  });
});

describe('sameAngleComparison', () => {
  it('toma el ángulo con más entradas, primera contra última, con "Mes N de obra"', () => {
    const p = base([
      up('a', '2025-08-10', { view: 'Dron' }),
      up('b', '2025-09-10', { view: 'Frente' }),
      up('c', '2025-12-10', { view: 'Dron' }),
      up('d', '2026-02-10', { view: 'Frente' }),
      up('e', '2026-05-10', { view: 'Frente' }),
    ], { startedAt: '2025-07-01' });
    const c = sameAngleComparison(p, visibleUpdates(p));
    expect(c?.angle).toBe('Frente');
    expect(c?.months).toBe(8);
    expect(c?.before).toMatchObject({ image: '/b.jpg', label: 'sep 2025 · Mes 3 de obra' });
    expect(c?.after).toMatchObject({ image: '/e.jpg', label: 'may 2026 · Mes 11 de obra' });
  });

  it('sin inicio de obra la etiqueta es solo la fecha; entradas solo-clip no cuentan', () => {
    const p = base([
      up('a', '2026-01-10', { view: 'Frente' }),
      up('b', '2026-02-10', { view: 'Frente', images: [], video: '/b.mp4' }),
      up('c', '2026-03-10', { view: 'Frente' }),
    ]);
    const c = sameAngleComparison(p, visibleUpdates(p));
    expect(c?.before.label).toBe('ene 2026');
    expect(c?.after.update.id).toBe('c');
  });

  it('null si ningún ángulo tiene dos entradas con foto', () => {
    const p = base([up('a', '2026-01-10', { view: 'Frente' }), up('b', '2026-02-10', { view: 'Dron' }), up('c', '2026-03-10')]);
    expect(sameAngleComparison(p, visibleUpdates(p))).toBeNull();
  });

  it('un borrador no entra (llega filtrado por visibleUpdates)', () => {
    const p = base([up('a', '2026-01-10', { view: 'Frente' }), up('b', '2026-02-10', { view: 'Frente', draft: true })]);
    expect(sameAngleComparison(p, visibleUpdates(p))).toBeNull();
  });
});

describe('progressHeadline', () => {
  it('porcentaje, etapa y entrega con el mes en minúscula', () => {
    expect(progressHeadline(base([], { percent: 72, currentStageId: 's1', deliveryEstimate: 'Diciembre 2027' })))
      .toBe('72% de avance · Terminaciones · Entrega estimada diciembre 2027');
  });

  it('una entrega que no arranca con mes va tal cual', () => {
    expect(progressHeadline(base([], { deliveryEstimate: 'Posesión desde junio 2027' }))).toBe('Posesión desde junio 2027');
  });

  it('solo fotos: la fecha de la última publicada', () => {
    expect(progressHeadline(base([up('a', '2026-03-01'), up('b', '2026-05-01', { draft: true })]))).toBe('Avance de obra · actualizado mar 2026');
  });

  it('nada: null', () => {
    expect(progressHeadline(base([]))).toBeNull();
  });
});

describe('showsConstructionProgress', () => {
  it('hace falta la sección prendida y algo para mostrar', () => {
    const p = base([], { percent: 40 });
    expect(showsConstructionProgress(p, ['about', 'progress'])).toBe(true);
    expect(showsConstructionProgress(p, ['about'])).toBe(false);
    expect(showsConstructionProgress(base([]), ['progress'])).toBe(false);
    expect(showsConstructionProgress(undefined, ['progress'])).toBe(false);
  });
});

describe('storyWindow y anclas', () => {
  it('las últimas 8', () => {
    const list = Array.from({ length: 12 }, (_, k) => up(`u${k}`, `2026-01-${String(k + 1).padStart(2, '0')}`));
    expect(storyWindow(list).map(u => u.id)).toEqual(['u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10', 'u11']);
    expect(storyWindow(list.slice(0, 3))).toHaveLength(3);
  });

  it('lee el id de #avance-<id>', () => {
    expect(updateIdFromHash('#avance-e3')).toBe('e3');
    expect(updateIdFromHash('#avance')).toBeNull();
    expect(updateIdFromHash('')).toBeNull();
  });
});
