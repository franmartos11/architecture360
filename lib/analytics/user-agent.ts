// Heurísticas de user agent para /api/track: descartar robots (buscadores,
// vistas previas de links de WhatsApp/Facebook, navegadores headless) y
// separar celular de computadora. Una tablet cuenta como computadora.

const BOT_RE = /bot|crawl|spider|slurp|headless|lighthouse|facebookexternalhit|whatsapp|telegram|preview|monitor|curl|wget|python-requests|axios|node-fetch/i;
const MOBILE_RE = /iphone|ipod|android.+mobile|windows phone|mobile safari|blackberry|opera mini/i;

export function isBotUserAgent(ua: string | null): boolean {
  return !!ua && BOT_RE.test(ua);
}

export function deviceFromUserAgent(ua: string | null): 'mobile' | 'desktop' {
  return ua && MOBILE_RE.test(ua) ? 'mobile' : 'desktop';
}
