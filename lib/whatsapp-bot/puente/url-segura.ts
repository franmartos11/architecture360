// Bajada segura de los adjuntos que manda el bot (fotos y planos de las
// unidades). Esas URLs las edita el dueño del proyecto: sin estos controles el
// puente podía pedir cualquier dirección de la red interna del servidor (SSRF)
// o bajar un archivo enorme a memoria.
// Sin dependencias de Next ni React; la red (DNS y fetch) llega inyectada.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { EnvioImposible } from './tope';

export const ADJUNTO_TOPE_BYTES = 16 * 1024 * 1024;
export const ADJUNTO_TOPE_MS = 45_000;

export type DepsUrlSegura = {
  /** Host del Storage de Supabase del proyecto (siempre permitido). null = ninguno. */
  hostSupabase: string | null;
  /** Todas las IPs de un nombre (DNS). */
  resolver(host: string): Promise<string[]>;
};

export type DepsBajada = DepsUrlSegura & {
  fetch: typeof fetch;
  topeBytes?: number;
  topeMs?: number;
};

/** Host de NEXT_PUBLIC_SUPABASE_URL, o null si no está o no es una URL. */
export function hostDeSupabase(url: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL): string | null {
  if (!url) return null;
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

async function resolverDns(host: string): Promise<string[]> {
  const r = await lookup(host, { all: true, verbatim: true });
  return r.map((x) => x.address);
}

/** Las dependencias reales (el host de Supabase se lee del entorno en el momento). */
export function depsUrlSegura(): DepsBajada {
  return { hostSupabase: hostDeSupabase(), resolver: resolverDns, fetch: (...a) => fetch(...a) };
}

// ─── IPs privadas ────────────────────────────────────────────────────

function ipv4ANumero(ip: string): number | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  let n = 0;
  for (const s of p) {
    if (!/^\d{1,3}$/.test(s)) return null;
    const v = Number(s);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

// [red, bits] en IPv4 que no son Internet pública.
const RANGOS_V4: [string, number][] = [
  ['0.0.0.0', 8], // "esta" red
  ['10.0.0.0', 8], // privada
  ['100.64.0.0', 10], // CGNAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local (incluye la metadata de la nube, 169.254.169.254)
  ['172.16.0.0', 12], // privada
  ['192.0.0.0', 24], // IETF
  ['192.0.2.0', 24], // documentación
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // privada
  ['198.18.0.0', 15], // benchmarks
  ['198.51.100.0', 24], // documentación
  ['203.0.113.0', 24], // documentación
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reservada + broadcast
];

function ipv4Privada(ip: string): boolean {
  const n = ipv4ANumero(ip);
  if (n === null) return true;
  return RANGOS_V4.some(([red, bits]) => {
    const base = ipv4ANumero(red) as number;
    const tam = 2 ** (32 - bits);
    return n >= base && n < base + tam;
  });
}

/** Las 8 palabras de 16 bits de una IPv6 (admite "::" y un IPv4 al final); null si no es válida. */
function palabrasIpv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zona = s.indexOf('%');
  if (zona !== -1) s = s.slice(0, zona);
  // Un IPv4 al final ("::ffff:10.0.0.1") se pasa a sus dos palabras hex.
  const ultimo = s.lastIndexOf(':');
  if (s.slice(ultimo + 1).includes('.')) {
    const v4 = ipv4ANumero(s.slice(ultimo + 1));
    if (v4 === null) return null;
    s = `${s.slice(0, ultimo + 1)}${Math.floor(v4 / 65536).toString(16)}:${(v4 % 65536).toString(16)}`;
  }
  const partes = s.split('::');
  if (partes.length > 2) return null;
  const leer = (t: string) => (t === '' ? [] : t.split(':'));
  const ini = leer(partes[0]);
  const fin = partes.length === 2 ? leer(partes[1]) : [];
  const libres = 8 - ini.length - fin.length;
  if (partes.length === 1 ? libres !== 0 : libres < 1) return null;
  const hex = [...ini, ...Array<string>(partes.length === 2 ? libres : 0).fill('0'), ...fin];
  const palabras: number[] = [];
  for (const h of hex) {
    if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
    palabras.push(parseInt(h, 16));
  }
  return palabras;
}

function ipv6Privada(ip: string): boolean {
  const w = palabrasIpv6(ip);
  if (!w || w.length !== 8) return true;
  const ceros = (desde: number, hasta: number) => w.slice(desde, hasta).every((x) => x === 0);
  const v4 = () => `${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`;
  // :: y ::1
  if (ceros(0, 7) && (w[7] === 0 || w[7] === 1)) return true;
  // IPv4 mapeada (::ffff:a.b.c.d) o compatible (::a.b.c.d): se juzga el IPv4.
  if (ceros(0, 5) && (w[5] === 0xffff || w[5] === 0)) return ipv4Privada(v4());
  // NAT64 (64:ff9b::/96): también lleva un IPv4 adentro.
  if (w[0] === 0x64 && w[1] === 0xff9b && ceros(2, 6)) return ipv4Privada(v4());
  if ((w[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 local única
  if ((w[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((w[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (vieja)
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  if (w[0] === 0x2001 && w[1] === 0x0db8) return true; // documentación
  if (w[0] === 0x2002) return true; // 6to4: puede apuntar a un IPv4 privado
  if (w[0] === 0x2001 && w[1] === 0) return true; // Teredo
  return false;
}

/** ¿La IP es privada, loopback, link-local, de metadata o reservada? Una IP inválida cuenta como privada. */
export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Privada(ip);
  if (v === 6) return ipv6Privada(ip);
  return true;
}

// ─── Validación de la URL ────────────────────────────────────────────

/**
 * Valida una URL de adjunto antes de pedirla. Solo https, sin usuario ni
 * puerto raro. El host del Storage de Supabase pasa directo; cualquier otro
 * tiene que resolver solo a IPs públicas. Rechaza con EnvioImposible (no se
 * reintenta).
 */
export async function validarUrlAdjunto(url: string, deps: DepsUrlSegura): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new EnvioImposible('Adjunto rechazado: la URL no es válida');
  }
  if (u.protocol !== 'https:') throw new EnvioImposible('Adjunto rechazado: solo se aceptan URLs https');
  if (u.username || u.password) throw new EnvioImposible('Adjunto rechazado: la URL no puede llevar usuario');
  if (u.port && u.port !== '443') throw new EnvioImposible('Adjunto rechazado: puerto no permitido');

  const host = u.host.toLowerCase();
  if (deps.hostSupabase && host === deps.hostSupabase) return u;

  // new URL deja las IPv6 entre corchetes.
  const nombre = u.hostname.replace(/^\[|\]$/g, '');
  let ips: string[];
  if (isIP(nombre)) ips = [nombre];
  else {
    try {
      ips = await deps.resolver(nombre);
    } catch {
      throw new Error(`No pude resolver el host del adjunto (${nombre})`);
    }
  }
  if (ips.length === 0) throw new Error(`El host del adjunto no resolvió a ninguna IP (${nombre})`);
  if (ips.some(esIpPrivada)) throw new EnvioImposible('Adjunto rechazado: el host apunta a una dirección privada');
  return u;
}

// ─── Bajada ──────────────────────────────────────────────────────────

export type AdjuntoBajado = { mime: string; base64: string; nombre: string };

function mimeAceptado(tipo: string | null): string | null {
  const base = (tipo ?? '').split(';')[0].trim().toLowerCase();
  if (/^image\/[a-z0-9.+-]+$/.test(base) || base === 'application/pdf') return base;
  return null;
}

function nombreDeArchivo(u: URL, mime: string): string {
  const ultimo = decodeURIComponent(u.pathname.split('/').pop() ?? '').replace(/[^\w.-]/g, '_');
  if (ultimo) return ultimo.slice(0, 100);
  return mime === 'application/pdf' ? 'adjunto.pdf' : 'imagen';
}

function esRedireccion(e: unknown): boolean {
  const causa = (e as { cause?: { message?: string } } | null)?.cause?.message ?? '';
  return /redirect/i.test(causa) || /redirect/i.test(e instanceof Error ? e.message : '');
}

/**
 * Baja un adjunto validado: sin redirecciones, con tope de tiempo y de tamaño
 * (Content-Length y lo que llega por el stream), y solo imágenes o PDF.
 * Lo que es un rechazo nuestro tira EnvioImposible (el ítem pasa a error sin
 * reintentos); un problema de red o un 5xx tira Error común (se reintenta).
 */
export async function bajarAdjunto(url: string, deps: DepsBajada = depsUrlSegura()): Promise<AdjuntoBajado> {
  const tope = deps.topeBytes ?? ADJUNTO_TOPE_BYTES;
  const u = await validarUrlAdjunto(url, deps);
  const corte = new AbortController();
  const timer = setTimeout(() => corte.abort(), deps.topeMs ?? ADJUNTO_TOPE_MS);
  try {
    let res: Response;
    try {
      res = await deps.fetch(u.toString(), { redirect: 'error', signal: corte.signal });
    } catch (e) {
      if (esRedireccion(e)) throw new EnvioImposible('Adjunto rechazado: la URL redirige a otra dirección');
      if (corte.signal.aborted) throw new Error('El adjunto no respondió a tiempo');
      throw e;
    }
    if (res.status >= 300 && res.status < 400) {
      throw new EnvioImposible('Adjunto rechazado: la URL redirige a otra dirección');
    }
    if (!res.ok) {
      const msg = `El adjunto respondió ${res.status}`;
      throw res.status >= 400 && res.status < 500 ? new EnvioImposible(msg) : new Error(msg);
    }
    const mime = mimeAceptado(res.headers.get('content-type'));
    if (!mime) throw new EnvioImposible('Adjunto rechazado: no es una imagen ni un PDF');
    const largo = Number(res.headers.get('content-length'));
    if (Number.isFinite(largo) && largo > tope) {
      throw new EnvioImposible(`Adjunto rechazado: pesa más de ${Math.round(tope / 1024 / 1024)} MB`);
    }
    if (!res.body) throw new Error('El adjunto llegó vacío');

    const partes: Uint8Array[] = [];
    let total = 0;
    const lector = res.body.getReader();
    for (;;) {
      let r: ReadableStreamReadResult<Uint8Array>;
      try {
        r = await lector.read();
      } catch (e) {
        if (corte.signal.aborted) throw new Error('El adjunto no terminó de bajar a tiempo');
        throw e;
      }
      if (r.done) break;
      total += r.value.byteLength;
      if (total > tope) {
        await lector.cancel().catch(() => {});
        throw new EnvioImposible(`Adjunto rechazado: pesa más de ${Math.round(tope / 1024 / 1024)} MB`);
      }
      partes.push(r.value);
    }
    if (total === 0) throw new EnvioImposible('Adjunto rechazado: el archivo está vacío');
    const base64 = Buffer.concat(partes).toString('base64');
    return { mime, base64, nombre: nombreDeArchivo(u, mime) };
  } finally {
    clearTimeout(timer);
  }
}
