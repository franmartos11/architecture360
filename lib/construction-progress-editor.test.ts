import { describe, expect, it } from 'vitest';
import {
  blankEntry, daysAgoLabel, defaultStageId, editableProgress, entryReadiness, forSave, monthTitle, obraSummary, readSaveResponse, setDraft, toIsoDate, upsertEntry,
} from './construction-progress-editor';
import type { ConstructionProgress, ConstructionUpdate } from '@/types';

const entry = (over: Partial<ConstructionUpdate> = {}): ConstructionUpdate => ({ id: 'e1', date: '2026-10-01', title: '', images: [], ...over });
const progress = (over: Partial<ConstructionProgress> = {}): ConstructionProgress => ({ stages: [{ id: 's0', label: 'Estructura' }, { id: 's1', label: 'Terminaciones' }], updates: [], ...over });

describe('toIsoDate / monthTitle', () => {
  it('usa la fecha local, no la de UTC', () => {
    // 23:30 del 10 de noviembre (hora local): sigue siendo el 10.
    expect(toIsoDate(new Date(2026, 10, 10, 23, 30))).toBe('2026-11-10');
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('arma el encabezado del mes', () => {
    expect(monthTitle('2026-11-03')).toBe('Noviembre 2026');
    expect(monthTitle('')).toBe('');
  });
});

describe('editableProgress', () => {
  it('null o basura → avance vacío', () => {
    expect(editableProgress(null)).toEqual({ stages: [], updates: [] });
    expect(editableProgress('x')).toEqual({ stages: [], updates: [] });
  });
  it('conserva lo guardado, updatedAt incluido', () => {
    const p = editableProgress({ stages: [{ id: 'a', label: 'A' }], updatedAt: '2026-11-01T00:00:00.000Z' });
    expect(p.updates).toEqual([]);
    expect(p.updatedAt).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('entrada nueva', () => {
  it('toma la etapa marcada en curso', () => {
    expect(defaultStageId(progress({ currentStageId: 's1' }))).toBe('s1');
  });
  it('si no hay marcada, la de la entrada más reciente que tenga una', () => {
    const p = progress({ updates: [entry({ id: 'a', date: '2026-01-01', stageId: 's0' }), entry({ id: 'b', date: '2026-05-01', stageId: 's1' }), entry({ id: 'c', date: '2026-06-01' })] });
    expect(defaultStageId(p)).toBe('s1');
  });
  it('arranca con la fecha de hoy y sin fotos', () => {
    const e = blankEntry(progress({ currentStageId: 's0' }), '2026-11-11');
    expect(e).toMatchObject({ date: '2026-11-11', stageId: 's0', title: '', images: [] });
    expect(e.id).toMatch(/^[a-z0-9]+$/);
  });
});

describe('entryReadiness', () => {
  it('vacía: no se puede guardar ni publicar', () => {
    expect(entryReadiness(entry())).toMatchObject({ canDraft: false, canPublish: false });
  });
  it('solo una línea: borrador sí, publicar no', () => {
    const r = entryReadiness(entry({ title: 'Losa piso 7' }));
    expect(r).toMatchObject({ canDraft: true, canPublish: false });
    expect(r.hint).toMatch(/foto o un clip/);
  });
  it('con foto o con clip se puede publicar', () => {
    expect(entryReadiness(entry({ images: ['https://x/a.jpg'] })).canPublish).toBe(true);
    expect(entryReadiness(entry({ video: 'https://x/a.mp4' })).canPublish).toBe(true);
  });
});

describe('upsertEntry / setDraft', () => {
  it('una entrada nueva va arriba, con el borrador marcado', () => {
    const p = upsertEntry(progress({ updates: [entry({ id: 'old' })] }), entry({ id: 'new', title: '  Losa  ' }), true);
    expect(p.updates.map(u => u.id)).toEqual(['new', 'old']);
    expect(p.updates[0]).toMatchObject({ draft: true, title: 'Losa' });
  });
  it('publicar saca el campo draft (ausente = publicada)', () => {
    const p = upsertEntry(progress({ updates: [entry({ id: 'a', draft: true })] }), entry({ id: 'a', draft: true }), false);
    expect(p.updates).toHaveLength(1);
    expect('draft' in p.updates[0]).toBe(false);
  });
  it('setDraft cambia solo la entrada pedida', () => {
    const p = setDraft(progress({ updates: [entry({ id: 'a' }), entry({ id: 'b' })] }), 'b', true);
    expect(p.updates[0].draft).toBeUndefined();
    expect(p.updates[1].draft).toBe(true);
    expect('draft' in setDraft(p, 'b', false).updates[1]).toBe(false);
  });
});

describe('forSave', () => {
  it('saca los vacíos que el schema rechazaría', () => {
    const p = forSave({
      stages: [{ id: 's', label: 'A', from: '', to: '2026-01-01' }, { id: 't', label: 'B', from: '2026-05-01', to: '2026-04-01' }],
      startedAt: '',
      updates: [entry({ images: ['https://x/a.jpg', ''], video: '', view: '' })],
    });
    expect(p.stages[0]).toEqual({ id: 's', label: 'A', to: '2026-01-01' });
    expect(p.stages[1]).toEqual({ id: 't', label: 'B', from: '2026-05-01' });
    expect('startedAt' in p).toBe(false);
    expect(p.updates[0].images).toEqual(['https://x/a.jpg']);
    expect('video' in p.updates[0]).toBe(false);
    expect('view' in p.updates[0]).toBe(false);
  });
});

describe('readSaveResponse', () => {
  it('ok: toma el updatedAt nuevo de la fila', () => {
    expect(readSaveResponse(200, { construction_progress: { stages: [], updates: [], updatedAt: '2026-11-11T10:00:00.000Z' } }))
      .toEqual({ kind: 'ok', updatedAt: '2026-11-11T10:00:00.000Z' });
    expect(readSaveResponse(200, { construction_progress: null })).toEqual({ kind: 'ok', updatedAt: undefined });
  });
  it('409 con el código del avance: conflicto con el mensaje del servidor', () => {
    expect(readSaveResponse(409, { error: 'Alguien más guardó', code: 'construction_progress_conflict' }))
      .toEqual({ kind: 'conflict', message: 'Alguien más guardó' });
  });
  it('otro 409 (sin código) es un error común', () => {
    expect(readSaveResponse(409, { error: 'otra cosa' }).kind).toBe('error');
  });
  it('columna faltante en la base', () => {
    expect(readSaveResponse(500, { error: 'column construction_progress does not exist' }).kind).toBe('error');
    expect(readSaveResponse(500, null)).toEqual({ kind: 'error', message: 'Error al guardar.' });
  });
});

describe('dashboard', () => {
  it('daysAgoLabel', () => {
    expect(daysAgoLabel(0)).toBe('hoy');
    expect(daysAgoLabel(-3)).toBe('hoy');
    expect(daysAgoLabel(1)).toBe('ayer');
    expect(daysAgoLabel(12)).toBe('hace 12 días');
  });
  it('sin avance: vacío', () => {
    expect(obraSummary(null, '2026-11-11')).toMatchObject({ empty: true, days: null, hasThisMonth: false, stale: false });
  });
  it('cuenta los días desde la última entrada (borradores incluidos) y si ya está la del mes', () => {
    const p = progress({ percent: 40, updates: [entry({ date: '2026-10-01' }), entry({ id: 'b', date: '2026-11-02', draft: true })] });
    expect(obraSummary(p, '2026-11-11')).toMatchObject({ empty: false, days: 9, percent: 40, hasThisMonth: true, stale: false });
  });
  it('más de un mes sin entradas: atrasada', () => {
    const p = progress({ updates: [entry({ date: '2026-08-01' })] });
    expect(obraSummary(p, '2026-11-11')).toMatchObject({ hasThisMonth: false, stale: true });
  });
});
