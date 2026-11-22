import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Un error de Supabase/PostgREST trae nombres de tablas, columnas y constraints.
// Devolverlo en la respuesta se lo regala a cualquiera que pueda provocar un
// error (incluidas las rutas anónimas, como /api/leads). Las rutas responden con
// serverError() de lib/api-errors, que deja el detalle en el log del servidor y
// manda un mensaje genérico. Los errores del usuario (400, 409…) se escriben a
// mano con su propio mensaje.
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

// `error: algo.message` o `error: algo?.message` dentro de lo que se responde.
const LEAK = /\berror\s*:\s*[A-Za-z_$][\w$.?]*\??\.message\b/;

describe('app/api: no se filtra el mensaje de la base', () => {
  const files = sources(__dirname);

  it('revisa archivos de verdad (que el test no pase en vacío)', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it.each(files.map(f => [f.slice(__dirname.length + 1), f]))('%s', (_name, file) => {
    const leaks = readFileSync(file, 'utf8')
      .split('\n')
      .map((line, i) => [i + 1, line] as const)
      .filter(([, line]) => LEAK.test(line));
    expect(leaks.map(([n, l]) => `${n}: ${l.trim()}`)).toEqual([]);
  });
});
