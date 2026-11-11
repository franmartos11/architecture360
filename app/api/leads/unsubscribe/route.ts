import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyUnsubscribeToken } from '@/lib/unsubscribe-token';
import { serverError } from '@/lib/api-errors';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(message: string, status = 200): NextResponse {
  return new NextResponse(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Novedades de la obra</title></head>` +
      `<body style="font-family:Arial,Helvetica,sans-serif;color:#1c1a17;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:24px;text-align:center"><p style="font-size:17px;max-width:420px">${message}</p></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }
  );
}

// Baja de las novedades de obra. Sin sesión: la autoriza el token firmado del
// link del correo (ver lib/unsubscribe-token.ts). Toca únicamente la fila de
// ese lead, y con service-role porque leads no tiene policy de UPDATE para
// usuarios. Es idempotente: darse de baja dos veces da el mismo "Listo".
//
// Un GET que escribe no es lo ideal (un preview de enlaces del cliente de
// correo podría dispararlo), pero acá el efecto es solo "dejar de mandarte
// correos", y los clientes de correo exigen que el link de baja funcione con
// un clic, sin pasos intermedios.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get('lead') ?? '';
  const token = searchParams.get('t') ?? '';

  if (!UUID.test(leadId) || !verifyUnsubscribeToken(leadId, token)) {
    return page('Este enlace de baja no es válido.', 400);
  }

  const { error } = await createAdminClient()
    .from('leads')
    .update({ updates_unsubscribed_at: new Date().toISOString() })
    .eq('id', leadId);
  if (error) return serverError(error, 'No pudimos procesar la baja. Probá de nuevo en un rato.');

  return page('Listo. No te mandamos más novedades de esta obra.');
}
