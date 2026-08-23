import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

import { DEFAULT_PROJECT_SLUG as PROJECT_SLUG } from '@/lib/constants';

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_LEADS = 5;

// Sin sesión no hay user_id para contar contra, a diferencia de
// comments/posts/messages — la IP es lo único que tenemos para frenar
// spam en un form 100% público. x-forwarded-for trae una lista
// "cliente, proxy1, proxy2..." cuando hay varios hops; el primero es
// el que puso el proxy de más confianza (Vercel).
function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip');
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name || !body.email || !body.phone) {
    return NextResponse.json({ error: 'Faltan datos requeridos' }, { status: 400 });
  }

  const supabase = await createClient();
  const ip = clientIp(request);

  if (ip) {
    // Con el cliente de sesión (anon) esto devolvería siempre 0 en
    // silencio, no un error: "leads" no tiene policy de SELECT para
    // anon a propósito (para que nadie lea leads ajenos desde el
    // navegador), así que el conteo necesita el cliente de service-role.
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
    const { count: recentCount } = await createAdminClient()
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .gte('created_at', since);
    if ((recentCount ?? 0) >= RATE_LIMIT_MAX_LEADS) {
      return NextResponse.json({ error: 'Demasiados envíos seguidos — esperá unos minutos e intentá de nuevo.' }, { status: 429 });
    }
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id, name, owner_id')
    .eq('slug', body.projectSlug || PROJECT_SLUG)
    .maybeSingle();

  // Insert público (policy RLS "public insert leads") — sin .select()
  // a propósito: no hay policy de SELECT para anon en leads, así que
  // pedir la fila de vuelta con RETURNING la filtraría a cero filas.
  const { error } = await supabase.from('leads').insert({
    project_id: project?.id ?? null,
    name: body.name,
    email: body.email,
    phone: body.phone,
    message: body.message ?? null,
    unit_name: body.unitName ?? null,
    method: body.method ?? null,
    source: body.source ?? null,
    ip_address: ip,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (project?.owner_id) {
    try {
      const { data: { user: owner } } = await createAdminClient().auth.admin.getUserById(project.owner_id);
      if (owner?.email) {
        await sendEmail({
          to: owner.email,
          subject: `Nuevo lead en ${project.name}`,
          html: `<p><strong>${body.name}</strong> dejó sus datos en <strong>${project.name}</strong>.</p>
            <p>Email: ${body.email}<br>Teléfono: ${body.phone}</p>
            ${body.message ? `<p>Mensaje: ${body.message}</p>` : ''}
            <p>Entrá a tu panel de administración → Leads para ver el detalle.</p>`,
        });
      }
    } catch (err) {
      console.error('[leads] no se pudo notificar al dueño', err);
    }
  }

  return NextResponse.json({ success: true });
}
