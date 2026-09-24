import { describe, it, expect } from 'vitest';
import { withActiveProject } from './active-project-context';

describe('withActiveProject', () => {
  it('sin projectId (fuera de un proyecto): deja la URL como estaba', () => {
    expect(withActiveProject('/api/admin/units', null)).toBe('/api/admin/units');
  });

  it('URL sin query previo: agrega ?projectId=', () => {
    expect(withActiveProject('/api/admin/units', 'p1')).toBe('/api/admin/units?projectId=p1');
  });

  it('URL con query previo: lo conserva y suma projectId', () => {
    const url = withActiveProject('/api/admin/units?floorId=f1', 'p1');
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('floorId')).toBe('f1');
    expect(params.get('projectId')).toBe('p1');
  });

  it('si la URL ya traía un projectId (viejo), lo pisa con el pinneado', () => {
    const url = withActiveProject('/api/admin/units?projectId=viejo', 'nuevo');
    expect(new URLSearchParams(url.split('?')[1]).get('projectId')).toBe('nuevo');
  });
});
