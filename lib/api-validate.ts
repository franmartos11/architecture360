import { NextResponse } from 'next/server';
import { z } from 'zod';

// Piezas reutilizables para los schemas de cada ruta — cubren los formatos
// que se repiten en el proyecto (uuid de recurso, email de lead/perfil,
// URL opcional de red social, moneda de 3 letras) para no repetir el mismo
// `.regex(...)` con distinta redacción de error en cada endpoint.
export const uuidSchema = z.uuid({ message: 'Id inválido' });
export const emailSchema = z.email({ message: 'Email inválido' }).max(254);
export const optionalUrlSchema = z.union([z.url({ message: 'URL inválida' }).max(500), z.literal('')]).optional();

/**
 * Parsea el body JSON de la request contra `schema`. Devuelve `{ data }`
 * si es válido, o `{ error }` con la respuesta 400 ya armada (mensaje del
 * primer problema que encontró zod, en criollo, no el objeto de errores
 * crudo) para que la ruta solo tenga que hacer:
 *
 *   const parsed = await parseJsonBody(request, schema);
 *   if ('error' in parsed) return parsed.error;
 *   const body = parsed.data;
 */
export async function parseJsonBody<S extends z.ZodType>(
  request: Request,
  schema: S
): Promise<{ data: z.infer<S> } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: 'Body inválido — se esperaba JSON.' }, { status: 400 }) };
  }
  return validateJson(json, schema);
}

/** Valida un valor ya parseado contra `schema` (mismo formato de error que parseJsonBody). */
export function validateJson<S extends z.ZodType>(
  json: unknown,
  schema: S
): { data: z.infer<S> } | { error: NextResponse } {
  const result = schema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.');
    const message = path ? `${path}: ${first.message}` : first?.message ?? 'Datos inválidos.';
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data };
}

/**
 * Lee el body como un objeto JSON (no array, no null, no un valor suelto).
 * Para las rutas que necesitan mirar el body crudo ANTES de validarlo con zod
 * (por ejemplo para dar un mensaje propio cuando un campo viene en null): un
 * body que no es JSON da 400 en vez del 500 que daba `request.json()` pelado.
 */
export async function readJsonObject(request: Request): Promise<{ data: Record<string, unknown> } | { error: NextResponse }> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return { error: NextResponse.json({ error: 'Body inválido — se esperaba JSON.' }, { status: 400 }) };
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return { error: NextResponse.json({ error: 'Body inválido — se esperaba un objeto JSON.' }, { status: 400 }) };
  }
  return { data: json as Record<string, unknown> };
}
