// Lo que el puente necesita fuera de una sesión de WhatsApp Web: dónde se
// guarda el login de cada bot, con qué entorno arranca Chromium y cómo cerrar
// los Chromium que quedaron colgados.
// Portado de aspa-software (lib/whatsapp/bridge/navegador.ts y lib/entorno.ts),
// sin la verificación de números.
import { execFileSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';

// Relativa a process.cwd(), como en aspa: el puente corre desde la raíz del repo.
export const DATA_PATH = '.wwebjs_auth';

// LocalAuth acepta solo letras, números, _ y - en el clientId; un id con
// cualquier otra cosa podría apuntar fuera de DATA_PATH al borrar.
const ID_SEGURO = /^[A-Za-z0-9_-]+$/;

// La carpeta del login guardado de un bot (.wwebjs_auth/session-<botId>),
// siempre dentro de DATA_PATH.
export function rutaSesion(botId: string, base: string = DATA_PATH): string {
  if (!ID_SEGURO.test(botId)) throw new Error(`Id de bot inválido para la carpeta de sesión: ${JSON.stringify(botId)}`);
  const raiz = path.resolve(base);
  const ruta = path.resolve(raiz, `session-${botId}`);
  if (path.dirname(ruta) !== raiz) throw new Error(`La carpeta de sesión quedó fuera de ${base}: ${ruta}`);
  return ruta;
}

// Lo que Chromium necesita para arrancar en macOS, Linux y Windows. Chromium
// abre WhatsApp Web: arranca con esta lista blanca, sin ningún secreto del
// proceso (clave de Supabase, de Anthropic).
const ENTORNO_NAVEGADOR = [
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'TMP', 'TEMP', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ',
  'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'DBUS_SESSION_BUS_ADDRESS',
  'FONTCONFIG_PATH', 'PLAYWRIGHT_BROWSERS_PATH', 'PUPPETEER_EXECUTABLE_PATH',
  'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'PATHEXT', 'ProgramFiles', 'ProgramFiles(x86)', 'LOCALAPPDATA', 'APPDATA', 'USERPROFILE',
];

export function entornoParaNavegador(env: Record<string, string | undefined> = process.env): Record<string, string> {
  const limpio: Record<string, string> = {};
  for (const n of ENTORNO_NAVEGADOR) {
    const v = env[n];
    if (v !== undefined) limpio[n] = v;
  }
  return limpio;
}

function estaVivo(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Un proceso con su línea de comando. `huerfano`: su dueño (el puente) ya no
// está: en macOS/Linux lo adopta init (PPID 1); en Windows no hay init, el
// padre directamente no existe (o su PID lo reusó otro programa).
export type Proceso = { pid: number; comando: string; huerfano: boolean };

// La salida de `ps -axo pid=,ppid=,command=`.
export function procesosDePs(salida: string): Proceso[] {
  return salida
    .split('\n')
    .map((linea) => linea.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => ({ pid: Number(m[1]), comando: m[3], huerfano: Number(m[2]) === 1 }));
}

// La salida de LISTAR_WINDOWS: JSON con pid, ppid, el nombre del padre (null si
// ya no existe) y la línea de comando. PowerShell 5.1 devuelve un objeto suelto
// en vez de una lista cuando hay uno solo.
export function procesosDeWindows(salida: string): Proceso[] {
  if (!salida.trim()) return [];
  const datos = JSON.parse(salida) as unknown;
  const filas = (Array.isArray(datos) ? datos : [datos]) as { pid: number; padre: string | null; comando: string | null }[];
  return filas
    .filter((f) => typeof f.comando === 'string')
    .map((f) => ({ pid: Number(f.pid), comando: f.comando as string, huerfano: !/^node(\.exe)?$/i.test(f.padre ?? '') }));
}

// Los Chromium de whatsapp-web.js entre los procesos.
// - carpeta 'todas': cualquier sesión (.wwebjs_auth/session-<id>), pero solo
//   los huérfanos: un Chromium cuyo dueño sigue vivo no se toca.
// - una carpeta exacta: los de esa sesión, tenga o no dueño vivo.
// Solo el proceso principal (el que lleva --user-data-dir); al morir se
// llevan sus procesos hijos. Sin comillas (Windows pone entre comillas el
// argumento con espacios) y sin distinguir mayúsculas (Windows no las distingue).
export function navegadoresDe(procesos: Proceso[], carpeta: string | 'todas', base: string): number[] {
  const normal = (t: string) => t.replace(/"/g, '').toLowerCase();
  const prefijo = normal(`--user-data-dir=${path.resolve(base, 'session')}`);
  const exacta = carpeta === 'todas' ? null : normal(`--user-data-dir=${path.resolve(base, carpeta)}`);
  return (
    procesos
      .filter((p) => !p.comando.includes('--type='))
      // Con espacio al final: session-ab no tiene que agarrar session-abc.
      .filter((p) => (exacta ? `${normal(p.comando)} `.includes(`${exacta} `) : normal(p.comando).includes(prefijo) && p.huerfano))
      .map((p) => p.pid)
  );
}

export function navegadoresEnPs(salida: string, carpeta: string | 'todas', base: string): number[] {
  return navegadoresDe(procesosDePs(salida), carpeta, base);
}

async function matar(pids: number[]): Promise<void> {
  if (process.platform === 'win32') {
    // process.kill en Windows cierra solo ese proceso; taskkill /T se lleva
    // también los de Chromium que cuelgan de él.
    for (const pid of pids) {
      try {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } catch {
        /* ya murió */
      }
    }
    for (let i = 0; i < 30 && pids.some(estaVivo); i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return;
  }
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ya murió */
    }
  }
  for (let i = 0; i < 30 && pids.some(estaVivo); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  for (const pid of pids.filter(estaVivo)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* ya murió */
    }
  }
}

// Los procesos con .wwebjs_auth en la línea de comando, con el nombre de su
// padre. Una sola lectura de la lista de procesos (Get-CimInstance tarda ~1 s).
// La salida en UTF-8: una ruta con tildes llega bien.
const LISTAR_WINDOWS = [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  '$p = Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,Name,CommandLine',
  '$n = @{}; foreach ($x in $p) { $n[[int]$x.ProcessId] = $x.Name }',
  `$s = @($p | Where-Object { $_.CommandLine -like '*${DATA_PATH}*' } | ForEach-Object { [pscustomobject]@{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; padre = $n[[int]$_.ParentProcessId]; comando = $_.CommandLine } })`,
  'ConvertTo-Json -Compress -InputObject $s',
].join('; ');

function listarProcesos(): Proceso[] | null {
  try {
    if (process.platform === 'win32') {
      const salida = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', LISTAR_WINDOWS], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
        windowsHide: true,
      });
      return procesosDeWindows(salida);
    }
    return procesosDePs(execFileSync('ps', ['-axo', 'pid=,ppid=,command='], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  } catch (e) {
    console.log(`[puente] no pude ver los procesos (no se cierra ningún Chromium): ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// Si el proceso que abrió Chromium muere de golpe (kill -9, cierre del
// terminal), el navegador queda huérfano reteniendo el lock de la sesión, y
// todo cliente nuevo falla con "The browser is already running". Para llamar
// al arrancar el puente.
export async function cerrarNavegadoresHuerfanos(): Promise<number> {
  const procesos = listarProcesos();
  if (!procesos) return 0;
  const huerfanos = navegadoresDe(procesos, 'todas', DATA_PATH);
  if (huerfanos.length === 0) return 0;
  await matar(huerfanos);
  console.log(`[puente] cerré ${huerfanos.length} Chromium huérfano(s) que bloqueaban la sesión.`);
  return huerfanos.length;
}

// Todo Chromium que use el login de este bot, aunque su dueño (este mismo
// puente) siga vivo. client.destroy() no cierra el navegador si perdió la
// conexión con él (pasa al despertar la compu): quedaba vivo con el lock y el
// reintento fallaba con "The browser is already running" o, peor, arrancaban
// dos WhatsApp Web con el mismo login y WhatsApp cerraba la sesión (pedía QR).
export async function cerrarNavegadoresDeSesion(botId: string): Promise<number> {
  const carpeta = rutaSesion(botId);
  const procesos = listarProcesos();
  if (!procesos) return 0;
  const pids = navegadoresDe(procesos, path.basename(carpeta), DATA_PATH);
  if (pids.length) await matar(pids);
  // En Windows, puppeteer da por "already running" cualquier arranque fallido
  // si queda el archivo `lockfile` en el perfil. Ya no lo usa ningún Chromium
  // (se acaban de cerrar todos los de esta sesión): se borra.
  if (process.platform === 'win32') {
    await rm(path.join(carpeta, 'lockfile'), { force: true }).catch(() => {});
  }
  return pids.length;
}

// Borra una carpeta de login (de rutaSesion), recursiva.
export async function borrarCarpetaSesion(ruta: string): Promise<void> {
  const raiz = path.resolve(DATA_PATH);
  if (path.dirname(path.resolve(ruta)) !== raiz) throw new Error(`No borro una carpeta fuera de ${DATA_PATH}: ${ruta}`);
  await rm(ruta, { recursive: true, force: true });
}
