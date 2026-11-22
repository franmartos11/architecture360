import { describe, it, expect } from 'vitest';
import { withoutDraftUpdates } from './construction-progress-public';

const u = (id: string, draft?: boolean) => ({ id, date: '2026-03-01', title: id, images: ['https://a/1.jpg'], ...(draft ? { draft } : {}) });

describe('withoutDraftUpdates', () => {
  it('saca los borradores y conserva el resto del avance', () => {
    const out = withoutDraftUpdates({ stages: [], percent: 40, updates: [u('a'), u('b', true)] });
    expect(out?.updates.map(x => x.id)).toEqual(['a']);
    expect(out?.percent).toBe(40);
  });
  it('sin borradores devuelve el mismo objeto; sin avance, undefined', () => {
    const p = { stages: [], updates: [u('a')] };
    expect(withoutDraftUpdates(p)).toBe(p);
    expect(withoutDraftUpdates(undefined)).toBeUndefined();
  });
});
