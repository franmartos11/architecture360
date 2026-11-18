import { describe, it, expect } from 'vitest';
import { mergeProjectsWithRoles } from './merge-projects';

const p = (id: string, created_at: string) => ({ id, created_at });

describe('mergeProjectsWithRoles', () => {
  it('marca los propios como dueño y las membresías con su rol', () => {
    const res = mergeProjectsWithRoles(
      [p('a', '2026-01-01')],
      [{ role: 'gestor', project: p('b', '2026-01-02') }],
    );
    expect(res.find(r => r.id === 'a')?.role).toBe('dueño');
    expect(res.find(r => r.id === 'b')?.role).toBe('gestor');
  });

  it('ordena por created_at descendente', () => {
    const res = mergeProjectsWithRoles(
      [p('a', '2026-01-01'), p('c', '2026-03-01')],
      [{ role: 'editor', project: p('b', '2026-02-01') }],
    );
    expect(res.map(r => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('descarta membresías sin proyecto (proyecto borrado)', () => {
    const res = mergeProjectsWithRoles([], [{ role: 'editor', project: null }]);
    expect(res).toEqual([]);
  });
});
