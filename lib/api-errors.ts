import { NextResponse } from 'next/server';

const GENERIC_MESSAGE = 'No se pudo completar la operación. Probá de nuevo en un rato.';

/**
 * Respuesta de error del servidor (por defecto 500) que NO filtra el mensaje de
 * la base. Un error de Supabase/PostgREST trae nombres de tablas, columnas y
 * constraints (`null value in column "x" violates not-null constraint`), y
 * devolverlo tal cual se lo regala a cualquiera que pueda provocar un error. Acá
 * el detalle completo queda en el log del servidor y al cliente le llega un
 * mensaje genérico (o el que la ruta pase, ya pensado para el usuario).
 *
 * Los errores que SÍ son del usuario (400, 409 por código duplicado…) se siguen
 * respondiendo a mano con su propio mensaje legible.
 */
export function serverError(error: unknown, publicMessage: string = GENERIC_MESSAGE, status = 500): NextResponse {
  console.error('[api]', publicMessage, error);
  return NextResponse.json({ error: publicMessage }, { status });
}
