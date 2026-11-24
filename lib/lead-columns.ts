// Columnas de leads que usan el panel y el bot (las del tipo Lead de
// types/index.ts). Sin ip_address: es solo para el rate limit del formulario
// público y no tiene por qué viajar al navegador. Sin imports de next/react:
// lo usa también el puente del bot, que corre con tsx fuera de Next.
export const LEAD_COLUMNS =
  'id, project_id, unit_id, unit_name, name, email, phone, method, message, source, ref, status, wa_conversacion_id, calificacion, created_at';

/**
 * Últimos 6 dígitos de un teléfono: siempre caen dentro del número del abonado,
 * cualquiera sea el formato en que se cargó (+54 9, 0 + área, 15...). Sirve
 * para traer de la base solo los candidatos y después comparar normalizado.
 * Misma expresión que la columna generada leads.phone_tail en schema.sql.
 */
export function phoneTail(phone: string | null | undefined): string | null {
  const d = String(phone ?? '').split(/[:@]/)[0].replace(/\D/g, '');
  return d.length >= 6 ? d.slice(-6) : null;
}
