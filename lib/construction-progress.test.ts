import { describe, it, expect } from 'vitest';
import { parseConstructionProgress, stampConstructionProgress } from './construction-progress-sanitize';
import { constructionMonth, currentStageIndex, daysBetween, daysSinceLastUpdate, formatUpdateDate, hasConstructionProgress, isPublishedUpdate, latestUpdate, suggestedStages, visibleUpdates } from './construction-progress';
import type { ConstructionProgress } from '@/types';

const img = 'https://x.supabase.co/storage/v1/object/public/a/1.jpg';

describe('parseConstructionProgress', () => {
  it('nada cargado: null (la columna vuelve a "sin avance")', () => {
    expect(parseConstructionProgress(null)).toBeNull();
    expect(parseConstructionProgress('hola')).toBeNull();
    expect(parseConstructionProgress({ stages: [], updates: [] })).toBeNull();
  });

  it('etapas libres: sanea el nombre y descarta las vacías', () => {
    const p = parseConstructionProgress({ stages: [{ id: 'a', label: '  <b>Pozo</b> ' }, { id: 'b', label: '' }], updates: [] });
    expect(p?.stages).toEqual([{ id: 'a', label: 'Pozo' }]);
  });

  it('repara ids inválidos o repetidos', () => {
    const p = parseConstructionProgress({ stages: [{ id: 'x', label: 'Uno' }, { id: 'x', label: 'Dos' }, { id: 'no válido!', label: 'Tres' }], updates: [] })!;
    const ids = p.stages.map(s => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe('x');
    expect(ids.every(id => /^[a-z0-9_-]+$/i.test(id))).toBe(true);
  });

  it('suelta referencias a etapas que ya no existen', () => {
    const p = parseConstructionProgress({
      stages: [{ id: 'a', label: 'Estructura' }],
      currentStageId: 'borrada',
      updates: [{ id: 'u1', date: '2026-01-10', stageId: 'borrada', title: 'Algo', images: [img] }],
    })!;
    expect(p.currentStageId).toBeUndefined();
    expect(p.updates[0].stageId).toBeUndefined();
  });

  it('actualizaciones: exige fecha yyyy-mm-dd, solo fotos http(s), y descarta las sin título ni fotos', () => {
    const p = parseConstructionProgress({
      stages: [],
      updates: [
        { id: 'u1', date: '2026-01-10', title: 'Ok', images: [img, 'javascript:alert(1)', 42] },
        { id: 'u2', date: '10/01/2026', title: 'Fecha mala', images: [img] },
        { id: 'u3', date: '2026-02-01', title: '', images: [] },
      ],
    })!;
    expect(p.updates.map(u => u.id)).toEqual(['u1']);
    expect(p.updates[0].images).toEqual([img]);
  });

  it('porcentaje entre 0 y 100, redondeado; entrega como texto libre', () => {
    expect(parseConstructionProgress({ percent: 140.7 })?.percent).toBe(100);
    expect(parseConstructionProgress({ percent: -3 })?.percent).toBe(0);
    expect(parseConstructionProgress({ percent: 'mucho', deliveryEstimate: 'Junio 2027' })).toEqual({ stages: [], updates: [], deliveryEstimate: 'Junio 2027' });
  });

  it('etapas con fechas: las guarda si son yyyy-mm-dd y descarta un fin anterior al inicio', () => {
    const p = parseConstructionProgress({
      stages: [
        { id: 'a', label: 'Uno', from: '2026-01-01', to: '2026-03-31' },
        { id: 'b', label: 'Dos', from: '2026-04-01', to: '2026-01-01' },
        { id: 'c', label: 'Tres', from: 'enero', to: '2026-09-30' },
      ],
      updates: [],
    })!;
    expect(p.stages).toEqual([
      { id: 'a', label: 'Uno', from: '2026-01-01', to: '2026-03-31' },
      { id: 'b', label: 'Dos', from: '2026-04-01' },
      { id: 'c', label: 'Tres', to: '2026-09-30' },
    ]);
  });

  it('entradas: clip http(s) opcional, borrador solo si es true, y una entrada con solo clip se conserva', () => {
    const p = parseConstructionProgress({
      stages: [],
      updates: [
        { id: 'u1', date: '2026-01-10', title: '', images: [], video: 'https://x.supabase.co/clip.mp4', draft: true },
        { id: 'u2', date: '2026-01-11', title: 'Sin clip válido', images: [img], video: 'javascript:alert(1)', draft: 'si' },
        { id: 'u3', date: '2026-01-12', title: '', images: [], video: 'ftp://x/clip.mp4' },
      ],
    })!;
    expect(p.updates).toEqual([
      { id: 'u1', date: '2026-01-10', title: '', images: [], video: 'https://x.supabase.co/clip.mp4', draft: true },
      { id: 'u2', date: '2026-01-11', title: 'Sin clip válido', images: [img] },
    ]);
  });

  it('inicio de obra y updatedAt: el inicio exige yyyy-mm-dd; updatedAt se conserva solo si es una fecha ISO válida', () => {
    expect(parseConstructionProgress({ startedAt: '2025-11-01' })).toEqual({ stages: [], updates: [], startedAt: '2025-11-01' });
    expect(parseConstructionProgress({ startedAt: 'noviembre' })).toBeNull();
    expect(parseConstructionProgress({ percent: 10, updatedAt: '2026-11-11T10:00:00.000Z' })?.updatedAt).toBe('2026-11-11T10:00:00.000Z');
    expect(parseConstructionProgress({ percent: 10, updatedAt: 'ayer' })?.updatedAt).toBeUndefined();
  });

  it('notifiedAt por entrada: se conserva si es una fecha ISO válida, se descarta si no', () => {
    const p = parseConstructionProgress({
      stages: [],
      updates: [
        { id: 'u1', date: '2026-01-10', title: 'A', images: [], notifiedAt: '2026-01-11T10:00:00.000Z' },
        { id: 'u2', date: '2026-01-12', title: 'B', images: [], notifiedAt: 'ayer' },
      ],
    })!;
    expect(p.updates[0].notifiedAt).toBe('2026-01-11T10:00:00.000Z');
    expect(p.updates[1].notifiedAt).toBeUndefined();
  });

  it('stampConstructionProgress: la marca es del servidor y pisa la que venga del panel', () => {
    const now = new Date('2026-11-11T12:00:00.000Z');
    const stamped = stampConstructionProgress({ stages: [], updates: [], percent: 5, updatedAt: '2020-01-01T00:00:00.000Z' }, now);
    expect(stamped.updatedAt).toBe('2026-11-11T12:00:00.000Z');
    expect(stamped.percent).toBe(5);
  });
});

describe('helpers', () => {
  const progress: ConstructionProgress = {
    stages: [{ id: 'a', label: 'Uno' }, { id: 'b', label: 'Dos' }, { id: 'c', label: 'Tres' }],
    updates: [
      { id: 'u2', date: '2026-05-01', stageId: 'b', title: 'Nueva', images: [img] },
      { id: 'u1', date: '2026-01-01', stageId: 'a', title: 'Vieja', images: [img] },
      { id: 'u3', date: '2026-06-01', title: 'Sin fotos', images: [] },
    ],
  };

  it('visibleUpdates: solo publicadas con foto o clip, de la más vieja a la más nueva', () => {
    expect(visibleUpdates(progress).map(u => u.id)).toEqual(['u1', 'u2']);
    const withDraftAndClip: ConstructionProgress = {
      ...progress,
      updates: [
        ...progress.updates,
        { id: 'u4', date: '2026-07-01', title: 'Borrador', images: [img], draft: true },
        { id: 'u5', date: '2026-08-01', title: 'Solo clip', images: [], video: 'https://x/clip.mp4' },
      ],
    };
    expect(visibleUpdates(withDraftAndClip).map(u => u.id)).toEqual(['u1', 'u2', 'u5']);
    expect(isPublishedUpdate({ id: 'x', date: '2026-01-01', title: 'x', images: [img], draft: true })).toBe(false);
  });

  it('latestUpdate y daysSinceLastUpdate: la más nueva por fecha; los borradores cuentan solo si se piden', () => {
    const withDraft: ConstructionProgress = {
      ...progress,
      updates: [...progress.updates, { id: 'd', date: '2026-09-01', title: 'Borrador', images: [], draft: true }],
    };
    expect(latestUpdate(withDraft)?.id).toBe('u3');
    expect(latestUpdate(withDraft, { includeDrafts: true })?.id).toBe('d');
    expect(latestUpdate({ stages: [], updates: [] })).toBeUndefined();
    expect(daysSinceLastUpdate(withDraft, '2026-09-11')).toBe(10);
    expect(daysSinceLastUpdate({ stages: [], updates: [] }, '2026-09-11')).toBeNull();
  });

  it('daysBetween y constructionMonth: sin zona horaria; el mes de inicio es el 1', () => {
    expect(daysBetween('2026-02-27', '2026-03-02')).toBe(3);
    expect(daysBetween('2026-03-02', '2026-02-27')).toBe(-3);
    const started: ConstructionProgress = { stages: [], updates: [], startedAt: '2025-11-15' };
    expect(constructionMonth(started, '2025-11-30')).toBe(1);
    expect(constructionMonth(started, '2026-11-01')).toBe(13);
    expect(constructionMonth(started, '2025-10-01')).toBeNull();
    expect(constructionMonth({ stages: [], updates: [] }, '2026-01-01')).toBeNull();
  });

  it('currentStageIndex: la marcada, o la de la actualización más reciente con etapa', () => {
    expect(currentStageIndex(progress)).toBe(1);
    expect(currentStageIndex({ ...progress, currentStageId: 'c' })).toBe(2);
    expect(currentStageIndex({ ...progress, updates: [] })).toBe(-1);
  });

  it('hasConstructionProgress: fotos, porcentaje o entrega alcanzan; solo etapas no', () => {
    expect(hasConstructionProgress(undefined)).toBe(false);
    expect(hasConstructionProgress({ stages: progress.stages, updates: [] })).toBe(false);
    expect(hasConstructionProgress({ stages: [], updates: [], percent: 0 })).toBe(true);
    expect(hasConstructionProgress(progress)).toBe(true);
  });

  it('formatUpdateDate: mes corto y año, sin depender de la zona horaria', () => {
    expect(formatUpdateDate('2026-01-01')).toBe('ene 2026');
    expect(formatUpdateDate('2025-12-31')).toBe('dic 2025');
  });

  it('suggestedStages: cambia por tipo, con ids únicos', () => {
    const loteo = suggestedStages('loteo');
    expect(loteo[0].label).toBe('Amojonamiento');
    expect(new Set(loteo.map(s => s.id)).size).toBe(loteo.length);
    expect(suggestedStages('casa')[0].label).toBe('Cimientos');
  });
});
