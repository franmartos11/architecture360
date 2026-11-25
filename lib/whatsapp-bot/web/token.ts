// Token de una charla del chat web. El navegador guarda el token; la base, solo
// su huella (sha-256 con forma de uuid, para la columna web_token uuid). Así,
// quien lee wa_conversaciones (el panel, Realtime) no puede usarlo para
// escribir en la charla como si fuera el comprador. Sin imports de next/react.
import { createHash, randomUUID } from 'node:crypto';

export function nuevoToken(): string {
  return randomUUID();
}

export function huellaToken(token: string): string {
  const h = createHash('sha256').update(token.trim().toLowerCase()).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
