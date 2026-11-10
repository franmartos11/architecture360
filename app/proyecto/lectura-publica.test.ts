import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// El sitio público tiene que leer el proyecto por la ruta CACHEADA
// (getSiteProject / getSiteProjectBySlug / getPublicProjectBySlug, sin cookies y
// con tag que invalida el admin). getProjectBySlug es la lectura del preview
// del admin: arma el proyecto entero contra Supabase en cada pedido (~700 ms
// medidos). Usarla desde una página pública hace que cada visita la pague, y
// además marca la request como dinámica por las cookies. Ya pasó: las páginas
// de unidad y de recorrido la usaban a través de getUnitById/getBuildingById.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe('lectura del sitio público (app/proyecto)', () => {
  const files = sources(__dirname);

  it('revisa archivos de verdad (que el test no pase en vacío)', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files.map(f => [f.slice(__dirname.length + 1), f]))('%s no usa la lectura sin caché del admin', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/\bgetProjectBySlug\b/);
    expect(source).not.toMatch(/\bgetUnitById\b|\bgetBuildingById\b/);
  });
});
