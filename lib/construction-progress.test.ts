import { describe, it, expect } from 'vitest';
import { parseConstructionProgress } from './construction-progress-sanitize';
import { currentStageIndex, formatUpdateDate, hasConstructionProgress, suggestedStages, visibleUpdates } from './construction-progress';
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

  it('visibleUpdates: solo con fotos, de la más vieja a la más nueva', () => {
    expect(visibleUpdates(progress).map(u => u.id)).toEqual(['u1', 'u2']);
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
