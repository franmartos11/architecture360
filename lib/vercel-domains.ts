import 'server-only';

// Cliente mínimo de la API REST de Vercel para dar de alta dominios propios en
// ESTE proyecto de Vercel (el que sirve el sitio). Necesita en el entorno:
//   VERCEL_TOKEN        token de acceso (Account Settings → Tokens), con permiso sobre el equipo
//   VERCEL_PROJECT_ID   id del proyecto (Settings → General)
//   VERCEL_TEAM_ID      solo si el proyecto es de un equipo (Team Settings → General)
// Sin token o sin project id, configured() es false y la pantalla del panel
// avisa que el alta es manual (ver ops en el README) en vez de romper.

const API = 'https://api.vercel.com';

export function vercelDomainsConfigured(): boolean {
  return !!process.env.VERCEL_TOKEN && !!process.env.VERCEL_PROJECT_ID;
}

export interface VercelVerificationRecord {
  type: string;   // 'TXT'
  domain: string; // dónde crear el registro
  value: string;
  reason: string;
}

export interface VercelDomainState {
  /** Vercel confirmó que el dominio es de quien lo agregó (no está tomado por otra cuenta). */
  verified: boolean;
  /** Registros TXT a crear si el dominio está en otra cuenta de Vercel. */
  verification: VercelVerificationRecord[];
  /** El DNS todavía no apunta a Vercel (o apunta mal). */
  misconfigured: boolean;
}

export class VercelDomainError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) {
    super(message);
  }
}

function qs(): string {
  const team = process.env.VERCEL_TEAM_ID;
  return team ? `?teamId=${encodeURIComponent(team)}` : '';
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!vercelDomainsConfigured()) {
    throw new VercelDomainError('Falta configurar VERCEL_TOKEN y VERCEL_PROJECT_ID en el servidor.', 503, 'not_configured');
  }
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    // Una consulta a Vercel nunca debería colgar una ruta del panel.
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } } & T;
  if (!res.ok) {
    throw new VercelDomainError(body.error?.message ?? `Vercel respondió ${res.status}`, res.status, body.error?.code);
  }
  return body as T;
}

const project = () => encodeURIComponent(process.env.VERCEL_PROJECT_ID!);
const domain = (hostname: string) => encodeURIComponent(hostname);

/** Códigos con los que addDomain rechaza un dominio que ya está tomado. */
export const DOMAIN_TAKEN_CODES = ['domain_on_platform', 'domain_already_in_use'] as const;

/**
 * Agrega el dominio al proyecto. Si el dominio YA estaba en este proyecto de
 * Vercel, se rechaza: no lo agregó esta alta, así que es un dominio de la
 * plataforma (el principal, un www, un alias) o de otro cliente cargado a
 * mano. Tomarlo como propio le daría ese host al proyecto apenas se
 * "verifique" (Vercel lo da por verificado y bien configurado), y al quitarlo
 * se borraría del proyecto de Vercel, tirando el sitio que lo usa.
 */
export async function addDomain(hostname: string): Promise<void> {
  try {
    await call(`/v9/projects/${project()}/domains/${domain(hostname)}${qs()}`);
    throw new VercelDomainError('El dominio ya está configurado en el proyecto de Vercel.', 409, 'domain_on_platform');
  } catch (err) {
    if (!(err instanceof VercelDomainError) || err.status !== 404) throw err;
  }
  // 409 domain_already_in_use (lo tiene otro proyecto de Vercel) sube tal cual.
  await call(`/v10/projects/${project()}/domains${qs()}`, { method: 'POST', body: JSON.stringify({ name: hostname }) });
}

export async function getDomainState(hostname: string): Promise<VercelDomainState> {
  const [info, config] = await Promise.all([
    call<{ verified?: boolean; verification?: VercelVerificationRecord[] }>(
      `/v9/projects/${project()}/domains/${domain(hostname)}${qs()}`
    ),
    call<{ misconfigured?: boolean }>(`/v6/domains/${domain(hostname)}/config${qs()}`),
  ]);
  return {
    verified: info.verified === true,
    verification: info.verification ?? [],
    misconfigured: config.misconfigured !== false,
  };
}

/** Le pide a Vercel que reintente la verificación de propiedad (TXT). */
export async function requestVerification(hostname: string): Promise<void> {
  await call(`/v9/projects/${project()}/domains/${domain(hostname)}/verify${qs()}`, { method: 'POST' });
}

/** Quita el dominio del proyecto. Si ya no estaba, no es un error. */
export async function removeDomain(hostname: string): Promise<void> {
  try {
    await call(`/v9/projects/${project()}/domains/${domain(hostname)}${qs()}`, { method: 'DELETE' });
  } catch (err) {
    if (err instanceof VercelDomainError && err.status === 404) return;
    throw err;
  }
}
