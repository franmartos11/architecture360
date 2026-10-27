import { describe, it, expect } from 'vitest';
import { projectNavHrefs } from './project-nav';

describe('projectNavHrefs', () => {
  it('casa: el link de unidades va directo a la casa', () => {
    expect(projectNavHrefs('', { buildingId: 'b', unitId: 'u', label: 'Casa' }).units).toBe('/edificio/b/unidad/u');
  });

  it('en subdominio el inicio es "/" y el resto no duplica la barra', () => {
    const h = projectNavHrefs('');
    expect(h.home).toBe('/');
    expect(h.masterplan).toBe('/masterplan');
  });
});
