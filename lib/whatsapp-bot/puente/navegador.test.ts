import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATA_PATH,
  entornoParaNavegador,
  navegadoresDe,
  navegadoresEnPs,
  procesosDeWindows,
  rutaSesion,
} from './navegador';

// Portado de aspa-software (lib/whatsapp/bridge/navegador.test.ts).

const BASE = '.wwebjs_auth';
const dir = (id: string) => path.resolve(BASE, `session-${id}`);
const CHROME = '/x/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing --allow-pre-commit-input';

describe('navegadoresEnPs (macOS/Linux)', () => {
  const PS = [
    // El de la sesión aaa, con el puente (500) vivo: quedó de antes de dormir.
    `  100   500 ${CHROME} --user-data-dir=${dir('aaa')} --headless`,
    // Su proceso hijo (renderer): no se cuenta, muere con el principal.
    `  101   100 /x/Helper --type=renderer --user-data-dir=${dir('aaa')}`,
    // Otro de la misma sesión, el nuevo.
    `  200   500 ${CHROME} --user-data-dir=${dir('aaa')}`,
    // Una sesión cuyo id empieza igual.
    `  300   500 ${CHROME} --user-data-dir=${dir('aaab')}`,
    // Huérfano de otra sesión (el puente murió de golpe).
    `  400     1 ${CHROME} --user-data-dir=${dir('ccc')}`,
    // Un Chrome que no es del puente.
    `  600     1 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome --user-data-dir=/Users/x/perfil`,
  ].join('\n');

  it('de una sesión: todos sus Chromium, aunque el puente siga vivo', () => {
    expect(navegadoresEnPs(PS, 'session-aaa', BASE)).toEqual([100, 200]);
  });
  it('de una sesión: no agarra otra con el id parecido', () => {
    expect(navegadoresEnPs(PS, 'session-aaab', BASE)).toEqual([300]);
  });
  it('huérfanos: solo los de PPID 1 del puente', () => {
    expect(navegadoresEnPs(PS, 'todas', BASE)).toEqual([400]);
  });
  it('sin procesos', () => {
    expect(navegadoresEnPs('', 'session-aaa', BASE)).toEqual([]);
  });
});

describe('procesosDeWindows', () => {
  const WIN = String.raw`"C:\Users\x\.cache\puppeteer\chrome\win64-1\chrome-win64\chrome.exe"`;
  const JSON_WIN = JSON.stringify([
    { pid: 100, ppid: 500, padre: 'node.exe', comando: `${WIN} --allow-pre-commit-input --user-data-dir=${dir('aaa')} --remote-debugging-port=0 about:blank` },
    { pid: 101, ppid: 100, padre: 'chrome.exe', comando: `${WIN} --type=renderer --user-data-dir=${dir('aaa')}` },
    { pid: 400, ppid: 999, padre: null, comando: `${WIN} --user-data-dir=${dir('ccc')} about:blank` },
    { pid: 401, ppid: 998, padre: 'explorer.exe', comando: `${WIN} --user-data-dir=${dir('ddd')}` },
    { pid: 600, ppid: 1, padre: null, comando: String.raw`"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\perfil` },
  ]);
  const procesos = procesosDeWindows(JSON_WIN);

  it('de una sesión, aunque el puente siga vivo', () => {
    expect(navegadoresDe(procesos, 'session-aaa', BASE)).toEqual([100]);
  });
  it('huérfanos = sin padre o el padre no es node', () => {
    expect(navegadoresDe(procesos, 'todas', BASE)).toEqual([400, 401]);
  });
  it('PowerShell 5.1 devuelve un objeto suelto si hay uno solo', () => {
    expect(procesosDeWindows(JSON.stringify({ pid: 5, ppid: 6, padre: 'node.exe', comando: `${WIN} --user-data-dir=${dir('aaa')}` }))).toHaveLength(1);
  });
  it('nada', () => {
    expect(procesosDeWindows('')).toEqual([]);
  });
});

describe('rutaSesion', () => {
  it('la carpeta del login de un bot, dentro de DATA_PATH', () => {
    expect(DATA_PATH).toBe('.wwebjs_auth');
    expect(rutaSesion('3f2b9c1e-0000-4000-8000-000000000001')).toBe(
      path.resolve(process.cwd(), '.wwebjs_auth', 'session-3f2b9c1e-0000-4000-8000-000000000001'),
    );
  });
  it.each(['', '../x', 'a/b', 'a\\b', '..', 'x y'])('rechaza un id que no es seguro (%j)', (id) => {
    expect(() => rutaSesion(id)).toThrow();
  });
});

describe('entornoParaNavegador', () => {
  it('pasa solo lo que Chromium necesita, nunca secretos', () => {
    const env = entornoParaNavegador({
      PATH: '/usr/bin',
      HOME: '/Users/x',
      SUPABASE_SERVICE_ROLE_KEY: 'secreto',
      ANTHROPIC_API_KEY: 'secreto',
      NEXT_PUBLIC_SUPABASE_URL: 'https://x',
    });
    expect(env).toEqual({ PATH: '/usr/bin', HOME: '/Users/x' });
  });
});
