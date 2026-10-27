import { describe, it, expect } from 'vitest';
import { isExploreProjectPath, isImmersiveProjectPath, projectNavHrefs } from './project-nav';

describe('isImmersiveProjectPath', () => {
  it.each([
    ['/proyecto/demo/edificio/torre-a/unidad/A01-02', '/proyecto/demo'],
    ['/proyecto/demo/edificio/torre-a/unidad/Casa%20Quincho', '/proyecto/demo'],
    ['/edificio/torre-a/unidad/A01-02/', ''],
  ])('%s es inmersiva', (path, base) => {
    expect(isImmersiveProjectPath(path, base)).toBe(true);
  });

  it.each([
    ['/proyecto/demo', '/proyecto/demo'],
    ['/proyecto/demo/unidades', '/proyecto/demo'],
    ['/proyecto/demo/amenities', '/proyecto/demo'],
    ['/proyecto/demo/ubicacion', '/proyecto/demo'],
    ['/proyecto/demo/edificio/torre-a', '/proyecto/demo'],
    // Explorar 3D usa la barra global (con su fila de contexto).
    ['/proyecto/demo/masterplan', '/proyecto/demo'],
    ['/proyecto/demo/recorrido', '/proyecto/demo'],
    ['/masterplan', ''],
    ['/', ''],
  ])('%s conserva la nav', (path, base) => {
    expect(isImmersiveProjectPath(path, base)).toBe(false);
  });
});

describe('isExploreProjectPath', () => {
  it.each([
    ['/proyecto/demo/masterplan', '/proyecto/demo'],
    ['/proyecto/demo/recorrido', '/proyecto/demo'],
    ['/proyecto/demo/edificio/torre-a', '/proyecto/demo'],
    ['/proyecto/demo/edificio/torre-a/recorrido', '/proyecto/demo'],
    ['/masterplan/', ''],
  ])('%s es Explorar 3D', (path, base) => {
    expect(isExploreProjectPath(path, base)).toBe(true);
  });

  it.each([
    ['/proyecto/demo', '/proyecto/demo'],
    ['/proyecto/demo/unidades', '/proyecto/demo'],
    ['/proyecto/demo/edificio/torre-a/unidad/A01-02', '/proyecto/demo'],
  ])('%s no es Explorar 3D', (path, base) => {
    expect(isExploreProjectPath(path, base)).toBe(false);
  });
});

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
