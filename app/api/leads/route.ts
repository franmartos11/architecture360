import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { parseJsonBody } from '@/lib/api-validate';
import { sanitizeText, sanitizeMultiline, escapeHtml } from '@/lib/sanitize';
import { rateLimitOrRespond } from '@/lib/rate-limit';
import { clientIp } from '@/lib/request-ip';

import { DEFAULT_PROJECT_SLUG as PROJECT_SLUG } from '@/lib/constants';

const RATE_LIMIT_WINDOW_SECONDS = 10 * 60;
const RATE_LIMIT_MAX_LEADS = 5;

// Límites de longitud generosos para un form de contacto real, pero que
// cortan un intento de mandar un payload de varios MB como "nombre".
const leadSchema = z.object({
  name: z.string().trim().min(1, 'Falta el nombre').max(200),
  email: z.email('Email inválido').max(254),
  phone: z.string().trim().min(1, 'Falta el teléfono').max(40),
  message: z.string().max(2000).optional(),
  unitName: z.string().max(100).optional(),
  method: z.string().max(50).optional(),
  source: z.string().max(50).optional(),
  projectSlug: z.string().max(100).optional(),
});

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, leadSchema);
  if ('error' in parsed) return parsed.error;
  const body = parsed.data;

  const supabase = await createClient();
  const ip = clientIp(request);

  if (ip) {
    // Con el cliente de sesión (anon) esto devolvería siempre 0 en
    // silencio, no un error: "leads" no tiene policy de SELECT para
    // anon a propósito (para que nadie lea leads ajenos desde el
    // navegador), así que el conteo necesita el cliente de service-role.
    const limited = await rateLimitOrRespond(
      { key: `leads:ip:${ip}`, windowSeconds: RATE_LIMIT_WINDOW_SECONDS, max: RATE_LIMIT_MAX_LEADS },
      'Demasiados envíos seguidos — esperá unos minutos e intentá de nuevo.'
    );
    if (limited) return limited;
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id')
    .eq('slug', body.projectSlug || PROJECT_SLUG)
    .maybeSingle();

  const name = sanitizeText(body.name, 200);
  const message = sanitizeMultiline(body.message, 2000) || null;

  // Insert público (policy RLS "public insert leads") — sin .select()
  // a propósito: no hay policy de SELECT para anon en leads, así que
  // pedir la fila de vuelta con RETURNING la filtraría a cero filas.
  const { error } = await supabase.from('leads').insert({
    project_id: project?.id ?? null,
    name,
    email: body.email,
    phone: sanitizeText(body.phone, 40),
    message,
    unit_name: sanitizeText(body.unitName, 100) || null,
    method: sanitizeText(body.method, 50) || null,
    source: sanitizeText(body.source, 50) || null,
    ip_address: ip,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (project?.owner_id) {
    try {
      const { data: { user: owner } } = await createAdminClient().auth.admin.getUserById(project.owner_id);
      if (owner?.email) {
        // escapeHtml acá porque esto va directo a un email en HTML, no a
        // la base — name/message ya están sanitizados (texto plano) para
        // el insert de arriba, pero un email interpreta HTML, así que
        // igual hay que escapar por si el texto plano contiene "<"/"&"
        // sueltos que romperían el markup del mensaje.
        await sendEmail({
          to: owner.email,
          subject: `Nuevo lead en ${project.name}`,
          html: `<p><strong>${escapeHtml(name)}</strong> dejó sus datos en <strong>${escapeHtml(project.name)}</strong>.</p>
            <p>Email: ${escapeHtml(body.email)}<br>Teléfono: ${escapeHtml(sanitizeText(body.phone, 40))}</p>
            ${message ? `<p>Mensaje: ${escapeHtml(message)}</p>` : ''}
            <p>Entrá a tu panel de administración → Leads para ver el detalle.</p>`,
        });
      }
    } catch (err) {
      console.error('[leads] no se pudo notificar al dueño', err);
    }
  }

  return NextResponse.json({ success: true });
}
