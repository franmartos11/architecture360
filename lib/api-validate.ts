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

  const result = schema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.');
    const message = path ? `${path}: ${first.message}` : first?.message ?? 'Datos inválidos.';
    return { error: NextResponse.json({ error: message }, { status: 400 }) };
  }
  return { data: result.data };
}
