import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

// Token de baja de novedades: HMAC-SHA256 del id del lead. Sin sesión ni
// tabla de tokens — quien tenga el link firmado puede darse de baja, y nadie
// puede fabricar el de otro lead sin el secreto.
//
// Secreto: LEADS_UNSUBSCRIBE_SECRET. Si falta, se usa SUPABASE_SERVICE_ROLE_KEY
// (que ya existe y nunca sale del servidor) para que la baja funcione sin
// configurar nada más. Contra: rotar esa clave invalida los links de bajas ya
// enviados; por eso conviene setear la variable propia apenas se pueda.
function secret(): string {
  const s = process.env.LEADS_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw new Error('Falta LEADS_UNSUBSCRIBE_SECRET (o SUPABASE_SERVICE_ROLE_KEY) para firmar los links de baja.');
  return s;
}

export function unsubscribeToken(leadId: string): string {
  return createHmac('sha256', secret()).update(`leads-unsubscribe:${leadId}`).digest('hex');
}

/** Comparación en tiempo constante; un token mal formado o sin secreto da false, nunca tira. */
export function verifyUnsubscribeToken(leadId: string, token: string): boolean {
  let expected: Buffer;
  try {
    expected = Buffer.from(unsubscribeToken(leadId), 'hex');
  } catch {
    return false;
  }
  const given = Buffer.from(token, 'hex');
  // Buffer.from(hex) corta en el primer carácter inválido: si el largo no
  // coincide con el esperado, el token venía roto.
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export function unsubscribeUrl(origin: string, leadId: string): string {
  return `${origin}/api/leads/unsubscribe?lead=${encodeURIComponent(leadId)}&t=${unsubscribeToken(leadId)}`;
}
