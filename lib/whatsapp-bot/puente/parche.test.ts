import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Portado de aspa-software (lib/whatsapp/bridge/parche-wwebjs.test.ts).
// whatsapp-web.js 1.34.7 no puede mandar archivos (wwebjs #201922): el parche
// de patches/ lo arregla hasta que salga un release con #201923. Acá el parche
// lo aplica pnpm (patchedDependencies en pnpm-workspace.yaml), no
// patch-package. Si esto falla, alguien actualizó la librería o el parche se
// dejó de aplicar.

const raiz = process.cwd();
const PARCHE = 'patches/whatsapp-web.js+1.34.7.patch';
// Con pnpm node_modules/whatsapp-web.js es un enlace a .pnpm/: se resuelve
// como lo haría el puente al importarla.
const lib = dirname(createRequire(join(raiz, 'package.json')).resolve('whatsapp-web.js/package.json'));

describe('parche de whatsapp-web.js', () => {
  it('whatsapp-web.js está en 1.34.7 (si se actualizó, revisá si el parche sigue haciendo falta: wwebjs #201923)', () => {
    const version = (JSON.parse(readFileSync(join(lib, 'package.json'), 'utf8')) as { version: string }).version;
    expect(version).toBe('1.34.7');
  });

  it(`existe ${PARCHE}`, () => {
    expect(existsSync(join(raiz, PARCHE))).toBe(true);
  });

  it('pnpm lo tiene en patchedDependencies', () => {
    const ws = readFileSync(join(raiz, 'pnpm-workspace.yaml'), 'utf8');
    expect(ws).toMatch(/patchedDependencies:\s*\n\s+whatsapp-web\.js@1\.34\.7:\s*patches\/whatsapp-web\.js\+1\.34\.7\.patch/);
  });

  it('el parche está aplicado en node_modules (corré pnpm install)', () => {
    expect(readFileSync(join(lib, 'src', 'util', 'Injected', 'Utils.js'), 'utf8')).toContain('delete message.__x_id');
  });
});
